import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { isValidSscc } from '../src/common/utils/sscc';
import { configureApp } from '../src/setup';

/**
 * Pełny proces magazynowy na prawdziwej bazie PostgreSQL:
 * PZ (paleta matczyna + sztuki) → rozlokowanie → replenishment → WZ (FEFO) → alerty → faktury → księgowość.
 */
describe('Proces magazynowy (e2e)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  let admin: string;
  let operator: string;
  const ids: Record<string, string> = {};

  const api = (token = admin) => ({
    get: (url: string) => request(app.getHttpServer()).get(`/api${url}`).set('Authorization', `Bearer ${token}`),
    post: (url: string, body: object = {}) =>
      request(app.getHttpServer()).post(`/api${url}`).set('Authorization', `Bearer ${token}`).send(body),
    put: (url: string, body: object = {}) =>
      request(app.getHttpServer()).put(`/api${url}`).set('Authorization', `Bearer ${token}`).send(body),
  });

  const login = async (email: string, password: string) =>
    (await request(app.getHttpServer()).post('/api/auth/login').send({ email, password }).expect(200)).body.accessToken;

  const totalStock = async () =>
    (await prisma.stockItem.aggregate({ where: { productId: ids.product }, _sum: { quantity: true } }))._sum.quantity ?? 0;

  beforeAll(async () => {
    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
    await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`);
    const hash = await bcrypt.hash('secret123', 4);
    await prisma.user.createMany({
      data: [
        { email: 'admin@test.local', name: 'Admin', role: 'ADMIN', passwordHash: hash },
        { email: 'op@test.local', name: 'Operator', role: 'OPERATOR', passwordHash: hash },
      ],
    });
    await prisma.companySettings.create({
      data: { id: 1, name: 'Test Sp. z o.o.', nip: '1234563218', street: 'ul. Testowa 1', postalCode: '00-001', city: 'Warszawa' },
    });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
    admin = await login('admin@test.local', 'secret123');
    operator = await login('op@test.local', 'secret123');
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('odrzuca żądania bez tokenu i błędne logowanie', async () => {
    await request(app.getHttpServer()).get('/api/products').expect(401);
    await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'admin@test.local', password: 'zle' }).expect(401);
  });

  it('tworzy dane podstawowe', async () => {
    ids.supplier = (await api().post('/contractors', { type: 'SUPPLIER', name: 'Dostawca Test', nip: '1111111111' }).expect(201)).body.id;
    ids.customer = (await api().post('/contractors', { type: 'CUSTOMER', name: 'Odbiorca Test', nip: '2222222222', paymentDays: 7 }).expect(201)).body.id;
    ids.rcv = (await api().post('/locations', { code: 'RCV-01', zone: 'RCV', type: 'RECEIVING' }).expect(201)).body.id;
    ids.pick = (await api().post('/locations', { code: 'P-01', zone: 'P', type: 'PICKING' }).expect(201)).body.id;
    const gen = await api().post('/locations/generate', { zone: 'A', type: 'STORAGE', aisles: 1, racks: 2, levels: 1, maxPallets: 1 }).expect(201);
    expect(gen.body.created).toBe(2);
    ids.storage = (await api().get('/locations/by-code/A-01-01-01').expect(200)).body.id;
    ids.storage2 = (await api().get('/locations/by-code/A-01-02-01').expect(200)).body.id;

    const product = await api()
      .post('/products', {
        sku: 'KAR-TEST', name: 'Karton testowy', unit: 'PCS', purchasePrice: 200, salePrice: 500,
        vatRate: 23, minStock: 100, isPackaging: true,
      })
      .expect(201);
    ids.product = product.body.id;
    await api().put(`/products/${ids.product}/pick-faces`, { locationId: ids.pick, minQty: 10, maxQty: 50 }).expect(200);

    // pick face tylko w lokalizacji PICKING
    await api().put(`/products/${ids.product}/pick-faces`, { locationId: ids.storage, minQty: 1, maxQty: 2 }).expect(400);
    // walidacja DTO
    await api().post('/products', { sku: 'zly sku', name: 'x' }).expect(400);
  });

  it('nowy produkt bez stanu generuje alert braku towaru', async () => {
    const alerts = (await api().get('/alerts').expect(200)).body;
    expect(alerts).toEqual([expect.objectContaining({ type: 'OUT_OF_STOCK', currentQty: 0, threshold: 100 })]);
  });

  it('przyjmuje paletę matczyną z kartonami oraz sztuki na tę samą paletę', async () => {
    const pz = await api(operator)
      .post('/receipts', { supplierId: ids.supplier, lines: [{ productId: ids.product, expectedQty: 120, unitPrice: 250 }] })
      .expect(201);
    ids.receipt = pz.body.id;
    expect(pz.body.number).toMatch(/^PZ\/\d{4}\/\d{2}\/0001$/);
    const lineId = (await api().get(`/receipts/${ids.receipt}`)).body.lines[0].id;

    const mixed = await api(operator)
      .post(`/receipts/${ids.receipt}/receive`, { lineId, mode: 'MIXED_PALLET', cartonCount: 4, qtyPerCarton: 25 })
      .expect(201);
    expect(mixed.body.received).toBe(100);
    expect(mixed.body.location).toBe('RCV-01');
    expect(mixed.body.handlingUnits).toHaveLength(5); // paleta matczyna + 4 kartony
    mixed.body.handlingUnits.forEach((h: { code: string }) => expect(isValidSscc(h.code)).toBe(true));
    ids.mother = mixed.body.handlingUnits[0].id;

    const piece = await api(operator)
      .post(`/receipts/${ids.receipt}/receive`, { lineId, mode: 'PIECE', quantity: 30, targetHandlingUnitId: ids.mother })
      .expect(201);
    expect(piece.body.overReceipt).toBe(true);

    const hu = (await api().get(`/handling-units/${ids.mother}`).expect(200)).body;
    expect(hu.totalQty).toBe(130);
    expect(hu.tree.ownQty).toBe(30);
    expect(hu.tree.children).toHaveLength(4);
    expect(hu.cartonCount).toBe(4);
    expect(hu.summary).toEqual([expect.objectContaining({ quantity: 130 })]);

    // brak alertu — stan 130 >= 100
    expect((await api().get('/alerts')).body).toHaveLength(0);
    // średni koszt = cena z PZ
    expect((await api().get(`/products/${ids.product}`)).body.avgCost).toBe(250);
  });

  it('zamyka PZ z raportem rozbieżności i drukuje dokumenty', async () => {
    const done = (await api(operator).post(`/receipts/${ids.receipt}/complete`).expect(201)).body;
    expect(done.status).toBe('COMPLETED');
    expect(done.totals).toMatchObject({ expectedQty: 120, receivedQty: 130, receivedValue: 130 * 250, discrepancies: 1 });

    const lineId = done.lines[0].id;
    await api(operator).post(`/receipts/${ids.receipt}/receive`, { lineId, mode: 'PIECE', quantity: 1 }).expect(400);

    const pdf = await api().get(`/receipts/${ids.receipt}/pdf`).expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');
    await api().get(`/handling-units/${ids.mother}/label`).expect(200).expect('Content-Type', 'application/pdf');
  });

  it('rozlokowuje paletę wraz z kartonami (putaway) i pilnuje pojemności lokalizacji', async () => {
    const move = await api(operator).post(`/handling-units/${ids.mother}/move`, { toLocationId: ids.storage }).expect(201);
    expect(move.body).toMatchObject({ type: 'PUTAWAY', movedItems: 5 });

    const items = await prisma.stockItem.findMany({ where: { productId: ids.product } });
    expect(items.every((i) => i.locationId === ids.storage)).toBe(true);
    const children = await prisma.handlingUnit.findMany({ where: { parentId: ids.mother } });
    expect(children.every((c) => c.locationId === ids.storage)).toBe(true);

    // druga paleta do pełnej lokalizacji (maxPallets = 1)
    const empty = (await api(operator).post('/handling-units', { type: 'PALLET', locationId: ids.rcv }).expect(201)).body;
    await api().post('/inventory/adjust', { kind: 'PLUS', productId: ids.product, locationId: ids.rcv, handlingUnitId: empty.id, quantity: 1, reason: 'test' }).expect(201);
    const full = await api(operator).post(`/handling-units/${empty.id}/move`, { toLocationId: ids.storage }).expect(409);
    expect(full.body.message).toContain('pełna');
    await api().post('/inventory/adjust', { kind: 'MINUS', productId: ids.product, locationId: ids.rcv, quantity: 1, reason: 'test' }).expect(201);
    expect(await totalStock()).toBe(130);
  });

  it('wylicza potrzebę uzupełnienia i realizuje zadanie replenishmentu', async () => {
    const overview = (await api().get('/replenishment').expect(200)).body;
    const row = overview.rows[0];
    expect(row).toMatchObject({ status: 'REQUIRED', current: 0, needed: 50, priority: 'URGENT', reserveQty: 130 });
    expect(row.suggestions).toEqual([expect.objectContaining({ fromLocationCode: 'A-01-01-01', quantity: 50 })]);

    const gen = (await api(operator).post('/replenishment/generate', {}).expect(201)).body;
    expect(gen.created).toBe(1);
    // ponowne generowanie nie dubluje zadań
    expect((await api(operator).post('/replenishment/generate', {}).expect(201)).body.created).toBe(0);
    expect((await api().get('/replenishment')).body.rows[0].status).toBe('IN_PROGRESS');

    await api(operator).post(`/replenishment/tasks/${gen.tasks[0].id}/complete`, {}).expect(201);
    const after = (await api().get('/replenishment')).body.rows[0];
    expect(after).toMatchObject({ status: 'OK', current: 50 });
    await api(operator).post(`/replenishment/tasks/${gen.tasks[0].id}/complete`, {}).expect(400);
  });

  it('wydaje towar wg FEFO (najpierw strefa kompletacji) i generuje alert niskiego stanu', async () => {
    const wz = (await api(operator).post('/issues', { customerId: ids.customer, lines: [{ productId: ids.product, quantity: 90 }] }).expect(201)).body;
    ids.issue = wz.id;
    const draft = (await api().get(`/issues/${wz.id}`)).body;
    expect(draft).toMatchObject({ canConfirm: true, totals: { net: 90 * 500, vat: Math.round(90 * 500 * 0.23) } });

    const confirmed = (await api(operator).post(`/issues/${wz.id}/confirm`).expect(201)).body;
    expect(confirmed.status).toBe('CONFIRMED');
    const alloc = confirmed.lines[0].allocations;
    expect(alloc[0]).toMatchObject({ locationCode: 'P-01', quantity: 50 });
    expect(alloc.slice(1).reduce((s: number, a: { quantity: number }) => s + a.quantity, 0)).toBe(40);
    expect(confirmed.lines[0].unitCost).toBe(250);
    expect(await totalStock()).toBe(40);

    const alerts = (await api().get('/alerts')).body;
    expect(alerts).toEqual([expect.objectContaining({ type: 'LOW_STOCK', currentQty: 40, status: 'OPEN' })]);
    await api(operator).post(`/alerts/${alerts[0].id}/acknowledge`).expect(201);
    expect((await api().get('/alerts/summary')).body).toMatchObject({ total: 1, open: 0, lowStock: 1 });
  });

  it('blokuje wydanie ponad stan i chroni przed wyścigiem dwóch równoległych WZ', async () => {
    const tooMuch = (await api(operator).post('/issues', { customerId: ids.customer, lines: [{ productId: ids.product, quantity: 41 }] })).body;
    const res = await api(operator).post(`/issues/${tooMuch.id}/confirm`).expect(409);
    expect(res.body.message).toContain('dostępne 40');
    expect(await totalStock()).toBe(40);
    await api(operator).post(`/issues/${tooMuch.id}/cancel`).expect(201);

    const a = (await api(operator).post('/issues', { customerId: ids.customer, lines: [{ productId: ids.product, quantity: 30 }] })).body;
    const b = (await api(operator).post('/issues', { customerId: ids.customer, lines: [{ productId: ids.product, quantity: 30 }] })).body;
    const results = await Promise.all([api(operator).post(`/issues/${a.id}/confirm`), api(operator).post(`/issues/${b.id}/confirm`)]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409]);
    expect(await totalStock()).toBe(10);
    expect((await api().get('/alerts')).body[0]).toMatchObject({ currentQty: 10 });

    // storno udanego WZ zwraca towar
    const ok = results[0].status === 201 ? a : b;
    const failed = ok === a ? b : a;
    await api(operator).post(`/issues/${failed.id}/cancel`).expect(201);
    await api().post(`/issues/${ok.id}/reverse`).expect(201);
    expect(await totalStock()).toBe(40);
  });

  it('zabrania operatorowi dostępu do faktur', async () => {
    await api(operator).get('/invoices').expect(403);
    await api(operator).get('/accounting/summary').expect(403);
  });

  it('wystawia fakturę sprzedaży do WZ z poprawnym VAT i kwotą słownie', async () => {
    const inv = (await api().post('/invoices/from-issues', { issueIds: [ids.issue] }).expect(201)).body;
    expect(inv.number).toMatch(/^FV\/\d{4}\/\d{2}\/0001$/);
    expect(inv).toMatchObject({ netTotal: 45000, vatTotal: 10350, grossTotal: 55350, type: 'SALES' });
    const due = new Date(inv.dueDate).getTime() - new Date(inv.issueDate).getTime();
    expect(Math.round(due / 86_400_000)).toBe(7); // termin płatności kontrahenta

    const details = (await api().get(`/invoices/${inv.id}`)).body;
    expect(details.amountInWords).toBe('pięćset pięćdziesiąt trzy złote 50/100');
    expect(details.goodsIssues).toHaveLength(1);
    expect(details.seller.name).toBe('Test Sp. z o.o.');

    await api().post('/invoices/from-issues', { issueIds: [ids.issue] }).expect(400);
    await api().post(`/issues/${ids.issue}/reverse`).expect(400);
    await api().get(`/invoices/${inv.id}/pdf`).expect(200).expect('Content-Type', 'application/pdf');

    await api().post(`/invoices/${inv.id}/paid`, {}).expect(201);
    await api().post(`/invoices/${inv.id}/cancel`).expect(400);
    ids.invoice = inv.id;
  });

  it('rozlicza fakturę zakupową z PZ i pokazuje różnicę cenową', async () => {
    const receipt = (await api().get(`/receipts/${ids.receipt}`)).body;
    const inv = (
      await api()
        .post('/invoices/purchase', {
          receiptId: ids.receipt,
          externalNumber: 'FV/DOST/123',
          issueDate: new Date().toISOString().slice(0, 10),
          prices: [{ receiptLineId: receipt.lines[0].id, unitNet: 260 }],
        })
        .expect(201)
    ).body;
    expect(inv).toMatchObject({ type: 'PURCHASE', netTotal: 130 * 260, receiptValue: 130 * 250, receiptDifference: 1300 });
    await api().post('/invoices/purchase', { receiptId: ids.receipt, externalNumber: 'X', issueDate: '2026-10-01' }).expect(400);
  });

  it('przygotowuje zestawienia księgowe i eksport CSV', async () => {
    const summary = (await api().get('/accounting/summary').expect(200)).body;
    expect(summary.sales).toMatchObject({ count: 1, net: 45000, vat: 10350 });
    expect(summary.purchases).toMatchObject({ count: 1, net: 33800 });
    expect(summary.vatDue).toBe(10350 - Math.round(33800 * 0.23));
    expect(summary.goodsIssues).toMatchObject({ net: 45000, cost: 90 * 250, margin: 45000 - 22500 });

    const pending = (await api().get('/accounting/pending')).body;
    expect(pending.receipts).toHaveLength(0);

    const csv = await api().get('/accounting/export/invoices').expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    const lines = csv.text.replace('﻿', '').split('\r\n');
    expect(lines[0]).toContain('Netto 23%');
    expect(lines).toHaveLength(3);
    expect(lines.find((l) => l.startsWith('Sprzedaż'))).toContain('450,00');
  });

  it('rejestruje pełną historię ruchów magazynowych', async () => {
    const movements = (await api().get(`/inventory/movements?productId=${ids.product}&pageSize=100`).expect(200)).body;
    const types = new Set(movements.items.map((m: { type: string }) => m.type));
    expect([...types].sort()).toEqual(
      ['ADJUSTMENT_MINUS', 'ADJUSTMENT_PLUS', 'ISSUE', 'PUTAWAY', 'RECEIPT', 'REPLENISHMENT'].sort(),
    );
    const stock = (await api().get('/inventory/summary').expect(200)).body.items[0];
    expect(stock).toMatchObject({ total: 40, value: 40 * 250, belowMin: true });
  });
});
