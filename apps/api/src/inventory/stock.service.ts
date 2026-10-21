import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { HandlingUnitStatus, LocationType, MovementType, Prisma } from '@prisma/client';
import { AlertsService } from '../alerts/alerts.service';
import { EventsService } from '../events/events.service';
import { PrismaService } from '../prisma/prisma.service';
import { Tx } from '../common/types';
import { allocateFefo } from '../common/utils/fefo';
import { stockKey } from '../common/utils/stock-key';

export interface AddStockInput {
  productId: string;
  locationId: string;
  handlingUnitId?: string | null;
  batch?: string | null;
  expiryDate?: Date | null;
  quantity: number;
  receivedAt?: Date;
}

export interface MovementInput {
  type: MovementType;
  productId: string;
  quantity: number;
  userId: string;
  fromLocationId?: string | null;
  toLocationId?: string | null;
  handlingUnitId?: string | null;
  batch?: string | null;
  documentNo?: string | null;
  reason?: string | null;
}

/** Kolejność pobierania przy wydaniu: najpierw strefa kompletacji, potem rezerwa. */
const ISSUE_PRIORITY: Partial<Record<LocationType, number>> = {
  [LocationType.PICKING]: 0,
  [LocationType.STORAGE]: 1,
  [LocationType.RECEIVING]: 2,
  [LocationType.SHIPPING]: 3,
};

const MAX_RETRIES = 3;

/**
 * Silnik stanów magazynowych. Wszystkie zmiany stanów przechodzą przez ten serwis,
 * w transakcji, z zapisem ruchu magazynowego (audyt).
 */
@Injectable()
export class StockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: AlertsService,
    private readonly events: EventsService,
  ) {}

  /**
   * Uruchamia operację w transakcji (z ponowieniem przy konflikcie serializacji),
   * a po zatwierdzeniu przelicza alerty i publikuje zdarzenie zmiany stanu.
   */
  async run<T>(fn: (tx: Tx, touched: Set<string>) => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      const touched = new Set<string>();
      try {
        const result = await this.prisma.$transaction((tx) => fn(tx, touched), { timeout: 20_000 });
        if (touched.size) {
          await this.alerts.evaluate([...touched]);
          this.events.emit('stock.changed', { productIds: [...touched] });
          this.events.emit('replenishment.changed');
        }
        return result;
      } catch (e) {
        const retryable = e instanceof Prisma.PrismaClientKnownRequestError && ['P2034', 'P2002'].includes(e.code);
        if (!retryable || attempt >= MAX_RETRIES) throw e;
      }
    }
  }

  async add(tx: Tx, input: AddStockInput) {
    if (input.quantity <= 0) throw new BadRequestException('Ilość musi być dodatnia');
    const key = stockKey(input);
    return tx.stockItem.upsert({
      where: { stockKey: key },
      create: {
        stockKey: key,
        productId: input.productId,
        locationId: input.locationId,
        handlingUnitId: input.handlingUnitId ?? null,
        batch: input.batch ?? null,
        expiryDate: input.expiryDate ?? null,
        quantity: input.quantity,
        receivedAt: input.receivedAt ?? new Date(),
      },
      update: { quantity: { increment: input.quantity } },
    });
  }

  /** Atomowe zdjęcie ilości z rekordu stanu (warunek quantity >= qty w UPDATE). */
  async take(tx: Tx, stockItemId: string, quantity: number) {
    if (quantity <= 0) throw new BadRequestException('Ilość musi być dodatnia');
    const res = await tx.stockItem.updateMany({
      where: { id: stockItemId, quantity: { gte: quantity } },
      data: { quantity: { decrement: quantity } },
    });
    if (res.count === 0) {
      throw new ConflictException('Niewystarczający stan w lokalizacji — stan mógł zostać zmieniony przez innego użytkownika');
    }
    const item = await tx.stockItem.findUniqueOrThrow({ where: { id: stockItemId } });
    if (item.quantity === 0) await tx.stockItem.delete({ where: { id: stockItemId } });
    return item;
  }

  movement(tx: Tx, m: MovementInput) {
    return tx.stockMovement.create({ data: m });
  }

  /** Przesunięcie części / całości rekordu stanu do innej lokalizacji (opcjonalnie na inną jednostkę). */
  async moveItem(
    tx: Tx,
    p: {
      stockItemId: string;
      quantity: number;
      toLocationId: string;
      toHandlingUnitId?: string | null;
      type: MovementType;
      userId: string;
      documentNo?: string;
      reason?: string;
    },
  ) {
    const source = await tx.stockItem.findUnique({ where: { id: p.stockItemId } });
    if (!source) throw new NotFoundException('Nie znaleziono pozycji stanu');
    if (source.locationId === p.toLocationId && source.handlingUnitId === (p.toHandlingUnitId ?? null)) {
      throw new BadRequestException('Lokalizacja docelowa jest taka sama jak źródłowa');
    }
    await this.assertLocationActive(tx, p.toLocationId);

    await this.take(tx, source.id, p.quantity);
    await this.add(tx, {
      productId: source.productId,
      locationId: p.toLocationId,
      handlingUnitId: p.toHandlingUnitId ?? null,
      batch: source.batch,
      expiryDate: source.expiryDate,
      quantity: p.quantity,
      receivedAt: source.receivedAt,
    });
    await this.movement(tx, {
      type: p.type,
      productId: source.productId,
      quantity: p.quantity,
      userId: p.userId,
      fromLocationId: source.locationId,
      toLocationId: p.toLocationId,
      handlingUnitId: source.handlingUnitId ?? p.toHandlingUnitId ?? null,
      batch: source.batch,
      documentNo: p.documentNo,
      reason: p.reason,
    });
    const huIds = [source.handlingUnitId, p.toHandlingUnitId].filter(Boolean) as string[];
    await this.refreshHandlingUnits(tx, huIds);
    return source;
  }

  /** Identyfikatory jednostki i wszystkich jednostek podrzędnych (drzewo palety matczynej). */
  async descendantIds(tx: Tx, rootId: string): Promise<string[]> {
    const all = [rootId];
    let frontier = [rootId];
    while (frontier.length) {
      const children = await tx.handlingUnit.findMany({ where: { parentId: { in: frontier } }, select: { id: true } });
      frontier = children.map((c) => c.id).filter((id) => !all.includes(id));
      all.push(...frontier);
    }
    return all;
  }

  /**
   * Przeniesienie całej jednostki logistycznej wraz z zawartością i jednostkami podrzędnymi.
   * Przeniesienie jednostki podrzędnej osobno odłącza ją od palety matczynej.
   */
  async moveHandlingUnit(
    tx: Tx,
    p: { handlingUnitId: string; toLocationId: string; userId: string; type: MovementType; documentNo?: string },
  ) {
    const hu = await tx.handlingUnit.findUnique({ where: { id: p.handlingUnitId } });
    if (!hu) throw new NotFoundException('Nie znaleziono jednostki logistycznej');
    if (hu.status !== HandlingUnitStatus.ACTIVE) throw new BadRequestException('Jednostka jest pusta');
    if (hu.locationId === p.toLocationId) throw new BadRequestException('Jednostka już znajduje się w tej lokalizacji');
    const target = await this.assertLocationActive(tx, p.toLocationId);

    if (target.maxPallets && hu.type === 'PALLET') {
      const occupied = await tx.handlingUnit.count({
        where: { locationId: target.id, status: 'ACTIVE', parentId: null, type: 'PALLET' },
      });
      if (occupied >= target.maxPallets) {
        throw new ConflictException(`Lokalizacja ${target.code} jest pełna (${occupied}/${target.maxPallets} palet)`);
      }
    }

    const ids = await this.descendantIds(tx, hu.id);
    const items = await tx.stockItem.findMany({ where: { handlingUnitId: { in: ids } } });
    const touched = new Set<string>();

    for (const item of items) {
      await tx.stockItem.update({
        where: { id: item.id },
        data: { locationId: p.toLocationId, stockKey: stockKey({ ...item, locationId: p.toLocationId }) },
      });
      await this.movement(tx, {
        type: p.type,
        productId: item.productId,
        quantity: item.quantity,
        userId: p.userId,
        fromLocationId: item.locationId,
        toLocationId: p.toLocationId,
        handlingUnitId: item.handlingUnitId,
        batch: item.batch,
        documentNo: p.documentNo ?? hu.code,
      });
      touched.add(item.productId);
    }
    await tx.handlingUnit.updateMany({ where: { id: { in: ids } }, data: { locationId: p.toLocationId } });
    if (hu.parentId) {
      await tx.handlingUnit.update({ where: { id: hu.id }, data: { parentId: null } });
      await this.refreshHandlingUnits(tx, [hu.parentId]);
    }
    return { handlingUnit: hu, productIds: [...touched], items: items.length };
  }

  /** Aktualizuje status (ACTIVE / EMPTY) jednostek i ich palet matczynych. */
  async refreshHandlingUnits(tx: Tx, ids: string[]) {
    const visited = new Set<string>();
    const queue = [...ids];
    while (queue.length) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const hu = await tx.handlingUnit.findUnique({
        where: { id },
        include: {
          stock: { where: { quantity: { gt: 0 } }, select: { id: true }, take: 1 },
          children: { where: { status: HandlingUnitStatus.ACTIVE }, select: { id: true }, take: 1 },
        },
      });
      if (!hu) continue;
      const status = hu.stock.length || hu.children.length ? HandlingUnitStatus.ACTIVE : HandlingUnitStatus.EMPTY;
      if (status !== hu.status) await tx.handlingUnit.update({ where: { id }, data: { status } });
      if (hu.parentId) queue.push(hu.parentId);
    }
  }

  /**
   * Pobranie ilości produktu wg FEFO (strefa kompletacji → rezerwa).
   * Zwraca alokacje z informacją o źródle — do zapisu na dokumencie WZ.
   */
  async pickFefo(
    tx: Tx,
    p: { productId: string; quantity: number; userId: string; type: MovementType; documentNo?: string; reason?: string },
  ) {
    const items = await tx.stockItem.findMany({
      where: {
        productId: p.productId,
        quantity: { gt: 0 },
        location: { type: { in: Object.keys(ISSUE_PRIORITY) as LocationType[] }, active: true },
      },
      include: { location: true, handlingUnit: { select: { code: true } } },
    });
    const allocations = allocateFefo(
      items.map((i) => ({ ...i, priority: ISSUE_PRIORITY[i.location.type] ?? 9 })),
      p.quantity,
    );
    if (!allocations) {
      const available = items.reduce((s, i) => s + i.quantity, 0);
      const product = await tx.product.findUnique({ where: { id: p.productId }, select: { sku: true } });
      throw new ConflictException(
        `Niewystarczający stan produktu ${product?.sku}: wymagane ${p.quantity}, dostępne ${available}`,
      );
    }

    for (const a of allocations) {
      await this.take(tx, a.item.id, a.quantity);
      await this.movement(tx, {
        type: p.type,
        productId: p.productId,
        quantity: a.quantity,
        userId: p.userId,
        fromLocationId: a.item.locationId,
        handlingUnitId: a.item.handlingUnitId,
        batch: a.item.batch,
        documentNo: p.documentNo,
        reason: p.reason,
      });
    }
    const huIds = allocations.map((a) => a.item.handlingUnitId).filter(Boolean) as string[];
    await this.refreshHandlingUnits(tx, huIds);

    return allocations.map((a) => ({
      locationCode: a.item.location.code,
      handlingUnitCode: a.item.handlingUnit?.code ?? null,
      batch: a.item.batch,
      expiryDate: a.item.expiryDate,
      quantity: a.quantity,
    }));
  }

  /** Łączny stan produktu (bez kwarantanny) — w transakcji. */
  async totalQuantity(tx: Tx, productId: string): Promise<number> {
    const agg = await tx.stockItem.aggregate({
      where: { productId, location: { type: { not: LocationType.QUARANTINE } } },
      _sum: { quantity: true },
    });
    return agg._sum.quantity ?? 0;
  }

  async assertLocationActive(tx: Tx, locationId: string) {
    const location = await tx.location.findUnique({ where: { id: locationId } });
    if (!location) throw new NotFoundException('Nie znaleziono lokalizacji');
    if (!location.active) throw new BadRequestException(`Lokalizacja ${location.code} jest nieaktywna`);
    return location;
  }
}
