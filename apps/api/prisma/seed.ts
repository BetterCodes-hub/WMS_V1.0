/**
 * Dane demonstracyjne. Operacje magazynowe wykonywane są przez serwisy domenowe
 * (tak jak przez API), dzięki czemu stany, ruchy, palety i dokumenty są spójne.
 * Uruchomienie: pnpm --filter api seed   (opcja --force czyści bazę)
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { LocationType, Prisma, PrismaClient, ProductUnit, ReceiptMode, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { HandlingUnitsService } from '../src/handling-units/handling-units.service';
import { InventoryService } from '../src/inventory/inventory.service';
import { InvoicesService } from '../src/invoices/invoices.service';
import { IssuesService } from '../src/issues/issues.service';
import { ReceiptsService } from '../src/receipts/receipts.service';
import { ReplenishmentService } from '../src/replenishment/replenishment.service';

const prisma = new PrismaClient();
const DAY = 86_400_000;

// deterministyczny generator liczb pseudolosowych (mulberry32)
let rngState = 20261021;
function rand() {
  rngState |= 0;
  rngState = (rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const randInt = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const pick = <T>(arr: T[]) => arr[Math.floor(rand() * arr.length)];

/** Przesuwa w czasie wszystko, co powstało od `since`, na wskazany dzień wstecz. */
async function backdate(since: Date, daysAgo: number) {
  if (daysAgo === 0) return;
  const shift = `${daysAgo} days`;
  const tables: [string, string[]][] = [
    ['StockMovement', ['createdAt']],
    ['ReceiptEntry', ['createdAt']],
    ['HandlingUnit', ['createdAt']],
    ['ReplenishmentTask', ['createdAt', 'completedAt']],
    ['StockAlert', ['createdAt']],
  ];
  for (const [table, cols] of tables) {
    const set = cols.map((c) => `"${c}" = "${c}" - interval '${shift}'`).join(', ');
    await prisma.$executeRawUnsafe(`UPDATE "${table}" SET ${set} WHERE "createdAt" >= $1`, since);
  }
  await prisma.$executeRawUnsafe(
    `UPDATE "StockItem" SET "receivedAt" = "receivedAt" - interval '${shift}' WHERE "receivedAt" >= $1`,
    since,
  );
  await prisma.$executeRawUnsafe(
    `UPDATE "GoodsReceipt" SET "createdAt" = "createdAt" - interval '${shift}',
       "completedAt" = "completedAt" - interval '${shift}' WHERE "createdAt" >= $1`,
    since,
  );
  await prisma.$executeRawUnsafe(
    `UPDATE "GoodsIssue" SET "createdAt" = "createdAt" - interval '${shift}', "issueDate" = "issueDate" - interval '${shift}',
       "confirmedAt" = "confirmedAt" - interval '${shift}' WHERE "createdAt" >= $1`,
    since,
  );
  await prisma.$executeRawUnsafe(
    `UPDATE "Invoice" SET "createdAt" = "createdAt" - interval '${shift}', "issueDate" = "issueDate" - interval '${shift}',
       "saleDate" = "saleDate" - interval '${shift}', "dueDate" = "dueDate" - interval '${shift}',
       "paidAt" = "paidAt" - interval '${shift}' WHERE "createdAt" >= $1`,
    since,
  );
}

async function wipe() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
}

const zl = (v: number) => Math.round(v * 100);

async function main() {
  const force = process.argv.includes('--force');
  if ((await prisma.user.count()) > 0) {
    if (!force) {
      console.log('Baza zawiera już dane — pomijam seed (użyj --force, aby wyczyścić i załadować ponownie).');
      return;
    }
    await wipe();
  }

  // ─── Użytkownicy ─────────────────────────────────────────────────────────
  const users = [
    { email: 'admin@wms.local', name: 'Anna Administrator', role: Role.ADMIN, password: 'admin123' },
    { email: 'kierownik@wms.local', name: 'Marek Kierownik', role: Role.MANAGER, password: 'demo1234' },
    { email: 'magazynier@wms.local', name: 'Piotr Magazynier', role: Role.OPERATOR, password: 'demo1234' },
    { email: 'ksiegowa@wms.local', name: 'Ewa Księgowa', role: Role.ACCOUNTANT, password: 'demo1234' },
  ];
  for (const u of users) {
    await prisma.user.create({
      data: { email: u.email, name: u.name, role: u.role, passwordHash: await bcrypt.hash(u.password, 10) },
    });
  }
  const operator = await prisma.user.findUniqueOrThrow({ where: { email: 'magazynier@wms.local' } });
  const manager = await prisma.user.findUniqueOrThrow({ where: { email: 'kierownik@wms.local' } });
  const accountant = await prisma.user.findUniqueOrThrow({ where: { email: 'ksiegowa@wms.local' } });

  await prisma.companySettings.create({
    data: {
      id: 1,
      name: 'Demo Logistics Sp. z o.o.',
      nip: '1234563218',
      street: 'ul. Magazynowa 12',
      postalCode: '05-800',
      city: 'Pruszków',
      bankAccount: '12 1020 1026 0000 0402 0000 1234',
      bankName: 'Bank Demo S.A.',
      email: 'biuro@demo-logistics.example',
      phone: '+48 22 000 00 00',
      invoicePaymentDays: 14,
      expiryWarningDays: 45,
    },
  });

  // ─── Kontrahenci ─────────────────────────────────────────────────────────
  const contractor = (data: Prisma.ContractorCreateInput) => prisma.contractor.create({ data });
  const kartonex = await contractor({ type: 'SUPPLIER', name: 'Kartonex Sp. z o.o.', shortName: 'Kartonex', nip: '7790001122', street: 'ul. Papiernicza 4', postalCode: '61-001', city: 'Poznań', email: 'zamowienia@kartonex.example', paymentDays: 30 });
  const elektro = await contractor({ type: 'SUPPLIER', name: 'Elektro-Hurt S.A.', shortName: 'Elektro-Hurt', nip: '5260003344', street: 'al. Jerozolimskie 200', postalCode: '02-486', city: 'Warszawa', email: 'handel@elektrohurt.example', paymentDays: 21 });
  const kawa = await contractor({ type: 'SUPPLIER', name: 'Palarnia Kawy Aroma Sp. j.', shortName: 'Aroma', nip: '6750005566', street: 'ul. Kawowa 9', postalCode: '30-001', city: 'Kraków', paymentDays: 14 });
  const gadzet = await contractor({ type: 'CUSTOMER', name: 'Gadżetownia.pl Sp. z o.o.', shortName: 'Gadżetownia', nip: '8970007788', street: 'ul. Handlowa 15', postalCode: '50-001', city: 'Wrocław', email: 'zakupy@gadzetownia.example', paymentDays: 14 });
  const biuro = await contractor({ type: 'CUSTOMER', name: 'Biuro Plus Jan Nowak', shortName: 'Biuro Plus', nip: '9510009900', street: 'ul. Biurowa 3/5', postalCode: '80-001', city: 'Gdańsk', paymentDays: 7 });
  const sklep = await contractor({ type: 'BOTH', name: 'Market Pod Lipami Sp. z o.o.', shortName: 'Pod Lipami', nip: '7120001010', street: 'ul. Lipowa 1', postalCode: '20-001', city: 'Lublin', paymentDays: 21 });

  // ─── Lokalizacje ─────────────────────────────────────────────────────────
  const loc: Prisma.LocationCreateManyInput[] = [
    { code: 'RCV-01', name: 'Rampa przyjęć 1', zone: 'RCV', type: LocationType.RECEIVING },
    { code: 'RCV-02', name: 'Rampa przyjęć 2', zone: 'RCV', type: LocationType.RECEIVING },
    { code: 'SHP-01', name: 'Strefa wysyłek', zone: 'SHP', type: LocationType.SHIPPING },
    { code: 'QUA-01', name: 'Kwarantanna / reklamacje', zone: 'QUA', type: LocationType.QUARANTINE },
  ];
  for (let r = 1; r <= 12; r++) loc.push({ code: `P-01-${String(r).padStart(2, '0')}`, name: `Półka kompletacyjna ${r}`, zone: 'P', type: LocationType.PICKING });
  for (let a = 1; a <= 3; a++)
    for (let r = 1; r <= 6; r++)
      for (let l = 1; l <= 3; l++)
        loc.push({ code: `A-${String(a).padStart(2, '0')}-${String(r).padStart(2, '0')}-${String(l).padStart(2, '0')}`, zone: 'A', type: LocationType.STORAGE, maxPallets: 1 });
  for (let r = 1; r <= 4; r++) loc.push({ code: `B-01-${String(r).padStart(2, '0')}-01`, zone: 'B', type: LocationType.STORAGE, maxPallets: 4, name: 'Pole odkładcze (blok)' });
  await prisma.location.createMany({ data: loc });
  const L = async (code: string) => prisma.location.findUniqueOrThrow({ where: { code } });
  const storage = await prisma.location.findMany({ where: { zone: 'A' }, orderBy: { code: 'asc' } });
  let storageIdx = 0;
  const nextStorage = () => storage[storageIdx++ % storage.length];

  // ─── Produkty ────────────────────────────────────────────────────────────
  type P = Omit<Prisma.ProductCreateInput, 'avgCost'> & { pick?: string; pickMin?: number; pickMax?: number };
  const productDefs: P[] = [
    { sku: 'KAR-600-400', ean: '5901234000017', name: 'Karton klapowy 600×400×400 mm, 5-warstwowy', category: 'Materiały opakowaniowe', unit: ProductUnit.PCS, purchasePrice: zl(3.2), salePrice: zl(4.9), minStock: 300, reorderQty: 1000, unitsPerPallet: 500, unitsPerCarton: 25, isPackaging: true, pick: 'P-01-01', pickMin: 40, pickMax: 150 },
    { sku: 'KAR-400-300', ean: '5901234000024', name: 'Karton klapowy 400×300×300 mm, 3-warstwowy', category: 'Materiały opakowaniowe', unit: ProductUnit.PCS, purchasePrice: zl(1.85), salePrice: zl(2.9), minStock: 400, reorderQty: 1500, unitsPerPallet: 800, unitsPerCarton: 50, isPackaging: true, pick: 'P-01-02', pickMin: 60, pickMax: 200 },
    { sku: 'KAR-300-200', ean: '5901234000031', name: 'Karton wysyłkowy 300×200×150 mm', category: 'Materiały opakowaniowe', unit: ProductUnit.PCS, purchasePrice: zl(0.95), salePrice: zl(1.6), minStock: 500, reorderQty: 2000, unitsPerPallet: 1200, unitsPerCarton: 100, isPackaging: true, pick: 'P-01-03', pickMin: 100, pickMax: 300 },
    { sku: 'TAS-48-66', ean: '5901234000048', name: 'Taśma pakowa 48 mm × 66 m, brązowa', category: 'Materiały opakowaniowe', unit: ProductUnit.ROLL, purchasePrice: zl(2.4), salePrice: zl(3.99), minStock: 120, reorderQty: 360, unitsPerCarton: 36, isPackaging: true, pick: 'P-01-04', pickMin: 24, pickMax: 72 },
    { sku: 'FOL-STR-23', ean: '5901234000055', name: 'Folia stretch 23 µm, 1,5 kg', category: 'Materiały opakowaniowe', unit: ProductUnit.ROLL, purchasePrice: zl(14.5), salePrice: zl(21.0), minStock: 30, reorderQty: 120, unitsPerCarton: 6, isPackaging: true },
    { sku: 'SLU-BT-200', ean: '5901234000109', name: 'Słuchawki bezprzewodowe BT-200', category: 'Elektronika', unit: ProductUnit.PCS, purchasePrice: zl(89), salePrice: zl(149), vatRate: 23, minStock: 40, reorderQty: 120, unitsPerPallet: 120, unitsPerCarton: 20, pick: 'P-01-05', pickMin: 10, pickMax: 40 },
    { sku: 'PWB-10K', ean: '5901234000116', name: 'Powerbank 10 000 mAh USB-C', category: 'Elektronika', unit: ProductUnit.PCS, purchasePrice: zl(45), salePrice: zl(79), minStock: 50, reorderQty: 200, unitsPerPallet: 200, unitsPerCarton: 20, pick: 'P-01-06', pickMin: 15, pickMax: 50 },
    { sku: 'KAB-USBC-1M', ean: '5901234000123', name: 'Kabel USB-C — USB-C, 1 m, 60 W', category: 'Elektronika', unit: ProductUnit.PCS, purchasePrice: zl(8.5), salePrice: zl(19.9), minStock: 100, reorderQty: 500, unitsPerCarton: 50, pick: 'P-01-07', pickMin: 30, pickMax: 120 },
    { sku: 'LAD-65W', ean: '5901234000130', name: 'Ładowarka sieciowa GaN 65 W', category: 'Elektronika', unit: ProductUnit.PCS, purchasePrice: zl(62), salePrice: zl(119), minStock: 25, reorderQty: 100, unitsPerCarton: 10, pick: 'P-01-08', pickMin: 8, pickMax: 30 },
    { sku: 'MYS-WL-01', ean: '5901234000147', name: 'Mysz bezprzewodowa ergonomiczna', category: 'Elektronika', unit: ProductUnit.PCS, purchasePrice: zl(35), salePrice: zl(69), minStock: 30, reorderQty: 100, unitsPerCarton: 20 },
    { sku: 'KAW-ZIA-1KG', ean: '5901234000208', name: 'Kawa ziarnista Arabica 1 kg', category: 'Spożywcze', unit: ProductUnit.PACK, purchasePrice: zl(52), salePrice: zl(84), vatRate: 5, minStock: 60, reorderQty: 200, unitsPerPallet: 240, unitsPerCarton: 6, trackBatches: true, pick: 'P-01-09', pickMin: 12, pickMax: 48 },
    { sku: 'HER-ZIE-100', ean: '5901234000215', name: 'Herbata zielona liściasta 100 g', category: 'Spożywcze', unit: ProductUnit.PACK, purchasePrice: zl(11), salePrice: zl(18.5), vatRate: 5, minStock: 50, reorderQty: 200, unitsPerCarton: 24, trackBatches: true, pick: 'P-01-10', pickMin: 24, pickMax: 96 },
    { sku: 'NOT-A5-KR', ean: '5901234000307', name: 'Notes A5 w kratkę, 96 kartek', category: 'Biuro', unit: ProductUnit.PCS, purchasePrice: zl(4.2), salePrice: zl(8.9), minStock: 80, reorderQty: 300, unitsPerCarton: 40, pick: 'P-01-11', pickMin: 20, pickMax: 80 },
    { sku: 'DLU-NIE-10', ean: '5901234000314', name: 'Długopis żelowy niebieski, op. 10 szt.', category: 'Biuro', unit: ProductUnit.SET, purchasePrice: zl(9.5), salePrice: zl(17.9), minStock: 40, reorderQty: 150, unitsPerCarton: 30 },
  ];
  const products: Record<string, Awaited<ReturnType<typeof prisma.product.create>>> = {};
  for (const { pick: pickCode, pickMin, pickMax, ...def } of productDefs) {
    const product = await prisma.product.create({ data: { ...def, avgCost: def.purchasePrice ?? 0 } });
    products[def.sku] = product;
    if (pickCode) {
      await prisma.pickFace.create({
        data: { productId: product.id, locationId: (await L(pickCode)).id, minQty: pickMin!, maxQty: pickMax! },
      });
    }
  }

  // ─── Operacje magazynowe przez serwisy domenowe ──────────────────────────
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const receipts = app.get(ReceiptsService);
  const units = app.get(HandlingUnitsService);
  const replenishment = app.get(ReplenishmentService);
  const issues = app.get(IssuesService);
  const invoices = app.get(InvoicesService);
  const inventory = app.get(InventoryService);
  const rcv1 = await L('RCV-01');
  const rcv2 = await L('RCV-02');

  const step = async (daysAgo: number, fn: () => Promise<void>) => {
    const since = new Date(Date.now() - 1000);
    await fn();
    await backdate(since, daysAgo);
  };

  const putawayReceipt = async (receiptId: string) => {
    const r = await receipts.findOne(receiptId);
    for (const hu of r.handlingUnits) {
      if (hu.location?.type !== LocationType.RECEIVING) continue;
      await units.move(hu.id, { toLocationId: nextStorage().id }, operator.id);
    }
  };
  const P = (sku: string) => products[sku];
  const expiry = (days: number) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);

  // Dzień -13: dostawa kartonów — palety jednorodne + paleta matczyna z kartonami taśmy
  let pz1Id = '';
  await step(13, async () => {
    const pz = await receipts.create(
      {
        supplierId: kartonex.id,
        supplierDocNo: 'WZ/KX/2026/1187',
        lines: [
          { productId: P('KAR-600-400').id, expectedQty: 1000 },
          { productId: P('KAR-400-300').id, expectedQty: 1600 },
          { productId: P('KAR-300-200').id, expectedQty: 2400 },
          { productId: P('TAS-48-66').id, expectedQty: 360 },
          { productId: P('FOL-STR-23').id, expectedQty: 60 },
        ],
      },
      operator.id,
    );
    pz1Id = pz.id;
    const r = await receipts.findOne(pz.id);
    const line = (sku: string) => r.lines.find((l) => l.product.sku === sku)!.id;
    await receipts.receive(pz.id, { lineId: line('KAR-600-400'), mode: ReceiptMode.PALLET, palletCount: 2, qtyPerPallet: 500, locationId: rcv1.id }, operator.id);
    await receipts.receive(pz.id, { lineId: line('KAR-400-300'), mode: ReceiptMode.PALLET, palletCount: 2, qtyPerPallet: 800, locationId: rcv1.id }, operator.id);
    await receipts.receive(pz.id, { lineId: line('KAR-300-200'), mode: ReceiptMode.PALLET, palletCount: 2, qtyPerPallet: 1200, locationId: rcv1.id }, operator.id);
    const mixed = await receipts.receive(pz.id, { lineId: line('TAS-48-66'), mode: ReceiptMode.MIXED_PALLET, cartonCount: 10, qtyPerCarton: 36, locationId: rcv1.id }, operator.id);
    // folia na tę samą paletę matczyną (paleta mieszana)
    await receipts.receive(pz.id, { lineId: line('FOL-STR-23'), mode: ReceiptMode.MIXED_PALLET, cartonCount: 10, qtyPerCarton: 6, motherPalletId: mixed.handlingUnits[0].id, locationId: rcv1.id }, operator.id);
    await receipts.complete(pz.id);
    await putawayReceipt(pz.id);
  });

  // Dzień -12: elektronika — palety, paleta matczyna z kartonami, sztuki luzem
  let pz2Id = '';
  await step(12, async () => {
    const pz = await receipts.create(
      {
        supplierId: elektro.id,
        supplierDocNo: 'FV/EH/10/2026/552',
        lines: [
          { productId: P('SLU-BT-200').id, expectedQty: 240 },
          { productId: P('PWB-10K').id, expectedQty: 200 },
          { productId: P('KAB-USBC-1M').id, expectedQty: 500 },
          { productId: P('LAD-65W').id, expectedQty: 100 },
          { productId: P('MYS-WL-01').id, expectedQty: 80 },
        ],
      },
      operator.id,
    );
    pz2Id = pz.id;
    const r = await receipts.findOne(pz.id);
    const line = (sku: string) => r.lines.find((l) => l.product.sku === sku)!.id;
    await receipts.receive(pz.id, { lineId: line('SLU-BT-200'), mode: ReceiptMode.PALLET, palletCount: 2, qtyPerPallet: 120, locationId: rcv2.id }, operator.id);
    const mixed = await receipts.receive(pz.id, { lineId: line('PWB-10K'), mode: ReceiptMode.MIXED_PALLET, cartonCount: 10, qtyPerCarton: 20, locationId: rcv2.id }, operator.id);
    await receipts.receive(pz.id, { lineId: line('LAD-65W'), mode: ReceiptMode.MIXED_PALLET, cartonCount: 10, qtyPerCarton: 10, motherPalletId: mixed.handlingUnits[0].id, locationId: rcv2.id }, operator.id);
    // kable na sztuki — dołożone luzem na paletę mieszaną
    await receipts.receive(pz.id, { lineId: line('KAB-USBC-1M'), mode: ReceiptMode.PIECE, quantity: 480, targetHandlingUnitId: mixed.handlingUnits[0].id, locationId: rcv2.id }, operator.id);
    await receipts.receive(pz.id, { lineId: line('MYS-WL-01'), mode: ReceiptMode.PALLET, palletCount: 1, qtyPerPallet: 80, locationId: rcv2.id }, operator.id);
    await receipts.complete(pz.id);
    await putawayReceipt(pz.id);
  });

  // Dzień -11: artykuły spożywcze z partiami i datami ważności + biurowe
  let pz3Id = '';
  await step(11, async () => {
    const pz = await receipts.create(
      {
        supplierId: kawa.id,
        lines: [
          { productId: P('KAW-ZIA-1KG').id, expectedQty: 240, batch: 'AR-2609-A', expiryDate: expiry(38) },
          { productId: P('HER-ZIE-100').id, expectedQty: 192, batch: 'HZ-0826', expiryDate: expiry(200) },
        ],
      },
      operator.id,
    );
    pz3Id = pz.id;
    const r = await receipts.findOne(pz.id);
    const line = (sku: string) => r.lines.find((l) => l.product.sku === sku)!.id;
    await receipts.receive(pz.id, { lineId: line('KAW-ZIA-1KG'), mode: ReceiptMode.PALLET, palletCount: 1, qtyPerPallet: 240, locationId: rcv1.id }, operator.id);
    await receipts.receive(pz.id, { lineId: line('HER-ZIE-100'), mode: ReceiptMode.MIXED_PALLET, cartonCount: 8, qtyPerCarton: 24, locationId: rcv1.id }, operator.id);
    await receipts.complete(pz.id);
    await putawayReceipt(pz.id);

    const pzb = await receipts.create(
      {
        supplierId: sklep.id,
        lines: [
          { productId: P('NOT-A5-KR').id, expectedQty: 400 },
          { productId: P('DLU-NIE-10').id, expectedQty: 150 },
        ],
      },
      operator.id,
    );
    const rb = await receipts.findOne(pzb.id);
    for (const l of rb.lines) {
      await receipts.receive(pzb.id, { lineId: l.id, mode: ReceiptMode.PALLET, palletCount: 1, qtyPerPallet: l.expectedQty, locationId: rcv2.id }, operator.id);
    }
    await receipts.complete(pzb.id);
    await putawayReceipt(pzb.id);
  });

  // Dzień -10: pierwsze uzupełnienie miejsc kompletacji
  await step(10, async () => {
    const { tasks } = await replenishment.generate({}, manager.id);
    for (const t of tasks) await replenishment.completeTask(t.id, {}, operator.id);
  });

  // Dni -9 … -1: wydania do klientów, zużycie kartonów, uzupełnienia
  const customers = [gadzet, biuro, sklep];
  const assortment: Record<string, string[]> = {
    [gadzet.id]: ['SLU-BT-200', 'PWB-10K', 'KAB-USBC-1M', 'LAD-65W', 'MYS-WL-01'],
    [biuro.id]: ['NOT-A5-KR', 'DLU-NIE-10', 'KAB-USBC-1M', 'MYS-WL-01', 'KAW-ZIA-1KG'],
    [sklep.id]: ['KAW-ZIA-1KG', 'HER-ZIE-100', 'KAR-300-200', 'TAS-48-66', 'NOT-A5-KR'],
  };
  const issuedIds: string[] = [];
  for (let day = 9; day >= 1; day--) {
    await step(day, async () => {
      const count = randInt(1, 3);
      for (let i = 0; i < count; i++) {
        const customer = pick(customers);
        const skus = [...assortment[customer.id]].sort(() => rand() - 0.5).slice(0, randInt(2, 4));
        const lines = skus.map((sku) => ({ productId: P(sku).id, quantity: randInt(3, sku.startsWith('KAR') ? 60 : 18) }));
        try {
          const wz = await issues.create({ customerId: customer.id, lines }, operator.id);
          await issues.confirm(wz.id, operator.id);
          issuedIds.push(wz.id);
        } catch {
          /* brak towaru — pomijamy zamówienie */
        }
      }
      // zużycie wewnętrzne materiałów opakowaniowych (pakowanie wysyłek)
      for (const sku of ['KAR-600-400', 'KAR-400-300', 'KAR-300-200', 'TAS-48-66']) {
        const qty = sku === 'TAS-48-66' ? randInt(15, 30) : randInt(70, 140);
        const stockAtPick = await prisma.stockItem.findMany({
          where: { productId: P(sku).id, location: { type: LocationType.STORAGE } },
          orderBy: { quantity: 'desc' },
          take: 1,
        });
        if (stockAtPick[0] && stockAtPick[0].quantity >= qty) {
          await inventory.adjust(
            { kind: 'CONSUMPTION', productId: P(sku).id, locationId: stockAtPick[0].locationId, stockItemId: stockAtPick[0].id, quantity: qty, reason: 'Zużycie do pakowania wysyłek' },
            operator.id,
          );
        }
      }
      if (day % 3 === 0) {
        const { tasks } = await replenishment.generate({}, manager.id);
        for (const t of tasks) await replenishment.completeTask(t.id, {}, operator.id);
      }
    });
  }

  // Faktury: sprzedaż do części WZ, zakupy do PZ
  await step(5, async () => {
    const confirmed = await prisma.goodsIssue.findMany({
      where: { id: { in: issuedIds }, invoiceId: null },
      orderBy: { issueDate: 'asc' },
    });
    const byCustomer = new Map<string, string[]>();
    confirmed.slice(0, Math.max(0, confirmed.length - 4)).forEach((i) => byCustomer.set(i.customerId, [...(byCustomer.get(i.customerId) ?? []), i.id]));
    let n = 0;
    for (const [, ids] of byCustomer) {
      const inv = await invoices.createFromIssues({ issueIds: ids }, accountant.id);
      if (n++ % 2 === 0) await invoices.markPaid(inv.id, {});
    }
    await invoices.createPurchase({ receiptId: pz1Id, externalNumber: 'FV/KX/2026/10/0931', issueDate: new Date().toISOString().slice(0, 10) }, accountant.id);
    await invoices.createPurchase({ receiptId: pz2Id, externalNumber: '552/10/2026', issueDate: new Date().toISOString().slice(0, 10) }, accountant.id);
    await invoices.createManual(
      {
        contractorId: gadzet.id,
        issueDate: new Date().toISOString().slice(0, 10),
        saleDate: new Date().toISOString().slice(0, 10),
        lines: [
          { name: 'Usługa magazynowania — paleta/miesiąc', unit: 'usł.', quantity: 6, unitNet: zl(45), vatRate: 23 },
          { name: 'Obsługa kompletacji zamówień', unit: 'usł.', quantity: 120, unitNet: zl(1.8), vatRate: 23 },
        ],
      },
      accountant.id,
    );
  });
  void pz3Id;

  // Dzisiaj: otwarte procesy do pokazania w UI
  // 1) przyjęcie w trakcie (częściowo przyjęte, palety na rampie)
  const pzOpen = await receipts.create(
    {
      supplierId: elektro.id,
      supplierDocNo: 'WZ/EH/2026/0601',
      expectedDate: new Date().toISOString().slice(0, 10),
      lines: [
        { productId: P('SLU-BT-200').id, expectedQty: 120 },
        { productId: P('PWB-10K').id, expectedQty: 100, unitPrice: zl(43.5) },
        { productId: P('MYS-WL-01').id, expectedQty: 60 },
      ],
    },
    operator.id,
  );
  const ro = await receipts.findOne(pzOpen.id);
  await receipts.receive(pzOpen.id, { lineId: ro.lines.find((l) => l.product.sku === 'SLU-BT-200')!.id, mode: ReceiptMode.PALLET, palletCount: 1, qtyPerPallet: 120, locationId: rcv2.id }, operator.id);
  await receipts.receive(pzOpen.id, { lineId: ro.lines.find((l) => l.product.sku === 'PWB-10K')!.id, mode: ReceiptMode.MIXED_PALLET, cartonCount: 4, qtyPerCarton: 20, locationId: rcv2.id }, operator.id);

  // 2) awizacja dostawy kartonów (szkic)
  await receipts.create(
    {
      supplierId: kartonex.id,
      notes: 'Pilne uzupełnienie kartonów — poniżej stanu minimalnego',
      expectedDate: new Date(Date.now() + DAY).toISOString().slice(0, 10),
      lines: [
        { productId: P('KAR-600-400').id, expectedQty: 1000 },
        { productId: P('KAR-400-300').id, expectedQty: 1600 },
      ],
    },
    manager.id,
  );

  // 3) szkic WZ
  await issues.create(
    { customerId: gadzet.id, notes: 'Wysyłka kurierem — zamówienie #10452', lines: [{ productId: P('SLU-BT-200').id, quantity: 12 }, { productId: P('KAB-USBC-1M').id, quantity: 40 }] },
    operator.id,
  );

  await app.close();
  const [alerts, stock] = await Promise.all([
    prisma.stockAlert.count({ where: { status: { not: 'RESOLVED' } } }),
    prisma.stockItem.count(),
  ]);
  console.log(`✔ Seed zakończony: ${Object.keys(products).length} produktów, ${stock} pozycji stanu, ${alerts} aktywnych alertów.`);
  console.log('  Logowanie: admin@wms.local / admin123  (oraz kierownik@, magazynier@, ksiegowa@wms.local / demo1234)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
