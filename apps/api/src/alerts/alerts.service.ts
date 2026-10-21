import { Injectable } from '@nestjs/common';
import { AlertStatus, AlertType, LocationType, Prisma } from '@prisma/client';
import { EventsService } from '../events/events.service';
import { PrismaService } from '../prisma/prisma.service';

const ACTIVE_STATUSES: AlertStatus[] = [AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED];

@Injectable()
export class AlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  /**
   * Przelicza alerty stanów dla wskazanych produktów.
   * Wywoływane po każdej operacji zmieniającej stan oraz po zmianie progu minimalnego.
   */
  async evaluate(productIds: string[]) {
    const ids = [...new Set(productIds)];
    if (!ids.length) return;

    const [products, sums, active] = await Promise.all([
      this.prisma.product.findMany({ where: { id: { in: ids } } }),
      this.prisma.stockItem.groupBy({
        by: ['productId'],
        where: { productId: { in: ids }, location: { type: { not: LocationType.QUARANTINE } } },
        _sum: { quantity: true },
      }),
      this.prisma.stockAlert.findMany({ where: { productId: { in: ids }, status: { in: ACTIVE_STATUSES } } }),
    ]);
    const qty = new Map(sums.map((s) => [s.productId, s._sum.quantity ?? 0]));
    const activeByProduct = new Map(active.map((a) => [a.productId, a]));

    for (const product of products) {
      const current = qty.get(product.id) ?? 0;
      const existing = activeByProduct.get(product.id);
      const breached = product.active && product.minStock > 0 && current < product.minStock;

      if (!breached) {
        if (existing) {
          await this.prisma.stockAlert.update({
            where: { id: existing.id },
            data: { status: AlertStatus.RESOLVED, resolvedAt: new Date(), currentQty: current },
          });
          this.events.emit('alert.resolved', { productId: product.id, sku: product.sku });
        }
        continue;
      }

      const type = current <= 0 ? AlertType.OUT_OF_STOCK : AlertType.LOW_STOCK;
      if (existing) {
        const escalated = existing.type === AlertType.LOW_STOCK && type === AlertType.OUT_OF_STOCK;
        await this.prisma.stockAlert.update({
          where: { id: existing.id },
          data: {
            currentQty: current,
            threshold: product.minStock,
            type,
            // eskalacja do braku towaru ponownie wymaga potwierdzenia
            ...(escalated ? { status: AlertStatus.OPEN, acknowledgedAt: null, acknowledgedById: null } : {}),
          },
        });
        if (escalated) this.emitCreated(product.id, product.sku, product.name, type, current, product.minStock);
        continue;
      }

      try {
        await this.prisma.stockAlert.create({
          data: { productId: product.id, type, threshold: product.minStock, currentQty: current },
        });
        this.emitCreated(product.id, product.sku, product.name, type, current, product.minStock);
      } catch (e) {
        // równoległa transakcja utworzyła już alert (unikalny indeks częściowy)
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
      }
    }
  }

  private emitCreated(productId: string, sku: string, name: string, type: AlertType, currentQty: number, threshold: number) {
    this.events.emit('alert.created', { productId, sku, name, type, currentQty, threshold });
  }

  findAll(status?: AlertStatus | 'ACTIVE') {
    const where: Prisma.StockAlertWhereInput =
      status === 'ACTIVE' || !status ? { status: { in: ACTIVE_STATUSES } } : { status };
    return this.prisma.stockAlert.findMany({
      where,
      include: {
        product: {
          select: { id: true, sku: true, name: true, unit: true, reorderQty: true, isPackaging: true, category: true },
        },
        acknowledgedBy: { select: { name: true } },
      },
      orderBy: [{ type: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
  }

  async summary() {
    const rows = await this.prisma.stockAlert.groupBy({
      by: ['type', 'status'],
      where: { status: { in: ACTIVE_STATUSES } },
      _count: { _all: true },
    });
    const count = (pred: (r: (typeof rows)[number]) => boolean) =>
      rows.filter(pred).reduce((s, r) => s + r._count._all, 0);
    return {
      total: count(() => true),
      open: count((r) => r.status === AlertStatus.OPEN),
      outOfStock: count((r) => r.type === AlertType.OUT_OF_STOCK),
      lowStock: count((r) => r.type === AlertType.LOW_STOCK),
    };
  }

  acknowledge(id: string, userId: string) {
    return this.prisma.stockAlert.update({
      where: { id, status: AlertStatus.OPEN },
      data: { status: AlertStatus.ACKNOWLEDGED, acknowledgedAt: new Date(), acknowledgedById: userId },
    });
  }

  /** Pełne przeliczenie — przydatne po imporcie danych. */
  async recalculateAll() {
    const products = await this.prisma.product.findMany({ select: { id: true } });
    await this.evaluate(products.map((p) => p.id));
    return this.summary();
  }
}
