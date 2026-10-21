import { Injectable } from '@nestjs/common';
import { IssueStatus, LocationType, MovementType, ReceiptStatus, TaskStatus } from '@prisma/client';
import { addDays, startOfDay } from '../common/utils/dates';
import { AlertsService } from '../alerts/alerts.service';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly alerts: AlertsService,
  ) {}

  async get() {
    const today = startOfDay(new Date());
    const since = addDays(today, -13);

    const [
      value, alertSummary, openTasks, urgentTasks, receiptsOpen, issuesDraft, issuesToday,
      products, storageTotal, storageUsed, movements, topIssued, recentAlerts,
    ] = await Promise.all([
      this.inventory.totalValue(),
      this.alerts.summary(),
      this.prisma.replenishmentTask.count({ where: { status: TaskStatus.OPEN } }),
      this.prisma.replenishmentTask.count({ where: { status: TaskStatus.OPEN, priority: 'URGENT' } }),
      this.prisma.goodsReceipt.count({ where: { status: { in: [ReceiptStatus.DRAFT, ReceiptStatus.RECEIVING] } } }),
      this.prisma.goodsIssue.count({ where: { status: IssueStatus.DRAFT } }),
      this.prisma.goodsIssue.count({ where: { status: IssueStatus.CONFIRMED, confirmedAt: { gte: today } } }),
      this.prisma.product.count({ where: { active: true } }),
      this.prisma.location.count({ where: { type: LocationType.STORAGE, active: true } }),
      this.prisma.location.count({
        where: { type: LocationType.STORAGE, active: true, stock: { some: { quantity: { gt: 0 } } } },
      }),
      this.prisma.$queryRaw<{ day: Date; type: MovementType; qty: bigint }[]>`
        SELECT date_trunc('day', "createdAt") AS day, type, SUM(quantity) AS qty
        FROM "StockMovement"
        WHERE "createdAt" >= ${since} AND type IN ('RECEIPT', 'ISSUE')
        GROUP BY 1, 2 ORDER BY 1`,
      this.prisma.$queryRaw<{ productId: string; sku: string; name: string; qty: bigint }[]>`
        SELECT m."productId", p.sku, p.name, SUM(m.quantity) AS qty
        FROM "StockMovement" m JOIN "Product" p ON p.id = m."productId"
        WHERE m.type = 'ISSUE' AND m."createdAt" >= ${addDays(today, -30)}
        GROUP BY 1, 2, 3 ORDER BY qty DESC LIMIT 5`,
      this.alerts.findAll('ACTIVE').then((a) => a.slice(0, 6)),
    ]);

    const days = Array.from({ length: 14 }, (_, i) => {
      const day = addDays(since, i);
      const key = day.toDateString();
      const sum = (type: MovementType) =>
        movements.filter((m) => new Date(m.day).toDateString() === key && m.type === type).reduce((s, m) => s + Number(m.qty), 0);
      return { date: day.toISOString().slice(0, 10), receipts: sum(MovementType.RECEIPT), issues: sum(MovementType.ISSUE) };
    });

    return {
      stockValue: value.value,
      stockQuantity: value.quantity,
      products,
      alerts: alertSummary,
      replenishment: { open: openTasks, urgent: urgentTasks },
      receiptsOpen,
      issuesDraft,
      issuesToday,
      occupancy: { used: storageUsed, total: storageTotal, percent: storageTotal ? Math.round((storageUsed / storageTotal) * 100) : 0 },
      movements: days,
      topIssued: topIssued.map((t) => ({ ...t, qty: Number(t.qty) })),
      recentAlerts,
    };
  }
}
