import { BadRequestException, Injectable } from '@nestjs/common';
import { LocationType, MovementType, Prisma } from '@prisma/client';
import { paginated } from '../common/pagination';
import { addDays } from '../common/utils/dates';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { AdjustDto, ExpiringQuery, InventoryQuery, MovementQuery, SummaryQuery, TransferDto } from './inventory.dto';
import { StockService } from './stock.service';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly settings: SettingsService,
  ) {}

  async list(q: InventoryQuery) {
    const where: Prisma.StockItemWhereInput = {
      quantity: { gt: 0 },
      ...(q.productId ? { productId: q.productId } : {}),
      ...(q.locationId ? { locationId: q.locationId } : {}),
      ...(q.locationType || q.zone
        ? { location: { ...(q.locationType ? { type: q.locationType } : {}), ...(q.zone ? { zone: q.zone } : {}) } }
        : {}),
      ...(q.search
        ? {
            OR: [
              { product: { sku: { contains: q.search, mode: 'insensitive' } } },
              { product: { name: { contains: q.search, mode: 'insensitive' } } },
              { product: { ean: { contains: q.search } } },
              { location: { code: { contains: q.search.toUpperCase() } } },
              { handlingUnit: { code: { contains: q.search } } },
              { batch: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.stockItem.findMany({
        where,
        include: {
          product: { select: { id: true, sku: true, name: true, unit: true, avgCost: true } },
          location: { select: { id: true, code: true, type: true, zone: true } },
          handlingUnit: {
            select: { id: true, code: true, type: true, parent: { select: { id: true, code: true } } },
          },
        },
        orderBy: [{ location: { code: 'asc' } }, { product: { sku: 'asc' } }],
        skip: q.skip,
        take: q.pageSize,
      }),
      this.prisma.stockItem.count({ where }),
    ]);
    return paginated(items, total, q);
  }

  /** Stany zagregowane per produkt z podziałem na strefy i wartością magazynu. */
  async summary(q: SummaryQuery) {
    const where: Prisma.ProductWhereInput = {
      active: true,
      ...(q.category ? { category: q.category } : {}),
      ...(q.onlyInStock ? { stock: { some: { quantity: { gt: 0 } } } } : {}),
      ...(q.search
        ? {
            OR: [
              { sku: { contains: q.search, mode: 'insensitive' } },
              { name: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [products, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({ where, orderBy: { sku: 'asc' }, skip: q.skip, take: q.pageSize }),
      this.prisma.product.count({ where }),
    ]);
    const rows = await this.prisma.stockItem.groupBy({
      by: ['productId', 'locationId'],
      where: { productId: { in: products.map((p) => p.id) }, quantity: { gt: 0 } },
      _sum: { quantity: true },
    });
    const locations = await this.prisma.location.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.locationId))] } },
      select: { id: true, type: true },
    });
    const typeOf = new Map(locations.map((l) => [l.id, l.type]));

    const items = products.map((p) => {
      const byType: Record<LocationType, number> = {
        RECEIVING: 0, STORAGE: 0, PICKING: 0, SHIPPING: 0, QUARANTINE: 0,
      };
      for (const r of rows.filter((r) => r.productId === p.id)) {
        byType[typeOf.get(r.locationId)!] += r._sum.quantity ?? 0;
      }
      const totalQty = byType.RECEIVING + byType.STORAGE + byType.PICKING + byType.SHIPPING;
      return {
        product: { id: p.id, sku: p.sku, name: p.name, unit: p.unit, category: p.category, minStock: p.minStock },
        byType,
        total: totalQty,
        value: totalQty * p.avgCost,
        avgCost: p.avgCost,
        belowMin: p.minStock > 0 && totalQty < p.minStock,
      };
    });
    return paginated(items, total, q);
  }

  async totalValue() {
    const rows = await this.prisma.$queryRaw<{ value: bigint | null; qty: bigint | null }[]>`
      SELECT SUM(s.quantity * p."avgCost") AS value, SUM(s.quantity) AS qty
      FROM "StockItem" s
      JOIN "Product" p ON p.id = s."productId"
      JOIN "Location" l ON l.id = s."locationId"
      WHERE l.type <> 'QUARANTINE'`;
    return { value: Number(rows[0]?.value ?? 0), quantity: Number(rows[0]?.qty ?? 0) };
  }

  async movements(q: MovementQuery) {
    const where: Prisma.StockMovementWhereInput = {
      ...(q.productId ? { productId: q.productId } : {}),
      ...(q.type ? { type: q.type } : {}),
      ...(q.locationId ? { OR: [{ fromLocationId: q.locationId }, { toLocationId: q.locationId }] } : {}),
      ...(q.from || q.to
        ? { createdAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: addDays(new Date(q.to), 1) } : {}) } }
        : {}),
      ...(q.search
        ? {
            OR: [
              { product: { sku: { contains: q.search, mode: 'insensitive' } } },
              { product: { name: { contains: q.search, mode: 'insensitive' } } },
              { documentNo: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.stockMovement.findMany({
        where,
        include: {
          product: { select: { sku: true, name: true, unit: true } },
          fromLocation: { select: { code: true } },
          toLocation: { select: { code: true } },
          handlingUnit: { select: { code: true } },
          user: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: q.skip,
        take: q.pageSize,
      }),
      this.prisma.stockMovement.count({ where }),
    ]);
    return paginated(items, total, q);
  }

  /** Partie z kończącą się datą ważności. */
  async expiring(q: ExpiringQuery) {
    const days = q.days ?? (await this.settings.get()).expiryWarningDays;
    return this.prisma.stockItem.findMany({
      where: { quantity: { gt: 0 }, expiryDate: { not: null, lte: addDays(new Date(), days) } },
      include: {
        product: { select: { id: true, sku: true, name: true, unit: true } },
        location: { select: { code: true, type: true } },
        handlingUnit: { select: { code: true } },
      },
      orderBy: { expiryDate: 'asc' },
    });
  }

  transfer(dto: TransferDto, userId: string) {
    return this.stock.run(async (tx, touched) => {
      if (dto.toHandlingUnitId) {
        const hu = await tx.handlingUnit.findUniqueOrThrow({ where: { id: dto.toHandlingUnitId } });
        if (hu.locationId !== dto.toLocationId) {
          throw new BadRequestException('Jednostka docelowa znajduje się w innej lokalizacji');
        }
      }
      const item = await this.stock.moveItem(tx, {
        stockItemId: dto.stockItemId,
        quantity: dto.quantity,
        toLocationId: dto.toLocationId,
        toHandlingUnitId: dto.toHandlingUnitId,
        type: MovementType.TRANSFER,
        userId,
      });
      touched.add(item.productId);
      return { ok: true };
    });
  }

  adjust(dto: AdjustDto, userId: string) {
    return this.stock.run(async (tx, touched) => {
      touched.add(dto.productId);
      if (dto.kind === 'PLUS') {
        await this.stock.assertLocationActive(tx, dto.locationId);
        await this.stock.add(tx, {
          productId: dto.productId,
          locationId: dto.locationId,
          handlingUnitId: dto.handlingUnitId,
          batch: dto.batch,
          expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
          quantity: dto.quantity,
        });
        if (dto.handlingUnitId) await this.stock.refreshHandlingUnits(tx, [dto.handlingUnitId]);
        await this.stock.movement(tx, {
          type: MovementType.ADJUSTMENT_PLUS,
          productId: dto.productId,
          quantity: dto.quantity,
          userId,
          toLocationId: dto.locationId,
          handlingUnitId: dto.handlingUnitId,
          batch: dto.batch,
          reason: dto.reason,
        });
        return { ok: true };
      }

      const type = dto.kind === 'CONSUMPTION' ? MovementType.CONSUMPTION : MovementType.ADJUSTMENT_MINUS;
      if (dto.stockItemId) {
        const item = await tx.stockItem.findUniqueOrThrow({ where: { id: dto.stockItemId } });
        if (item.productId !== dto.productId || item.locationId !== dto.locationId) {
          throw new BadRequestException('Pozycja stanu nie odpowiada produktowi / lokalizacji');
        }
        await this.stock.take(tx, item.id, dto.quantity);
        await this.stock.movement(tx, {
          type,
          productId: dto.productId,
          quantity: dto.quantity,
          userId,
          fromLocationId: dto.locationId,
          handlingUnitId: item.handlingUnitId,
          batch: item.batch,
          reason: dto.reason,
        });
        if (item.handlingUnitId) await this.stock.refreshHandlingUnits(tx, [item.handlingUnitId]);
        return { ok: true };
      }

      // bez wskazania pozycji — zdejmujemy wg FEFO z podanej lokalizacji
      const items = await tx.stockItem.findMany({
        where: { productId: dto.productId, locationId: dto.locationId, quantity: { gt: 0 } },
        orderBy: [{ expiryDate: 'asc' }, { receivedAt: 'asc' }],
      });
      let remaining = dto.quantity;
      for (const item of items) {
        if (remaining <= 0) break;
        const qty = Math.min(item.quantity, remaining);
        await this.stock.take(tx, item.id, qty);
        await this.stock.movement(tx, {
          type,
          productId: dto.productId,
          quantity: qty,
          userId,
          fromLocationId: dto.locationId,
          handlingUnitId: item.handlingUnitId,
          batch: item.batch,
          reason: dto.reason,
        });
        if (item.handlingUnitId) await this.stock.refreshHandlingUnits(tx, [item.handlingUnitId]);
        remaining -= qty;
      }
      if (remaining > 0) throw new BadRequestException('Niewystarczający stan w lokalizacji');
      return { ok: true };
    });
  }
}
