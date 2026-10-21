import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LocationType, MovementType, TaskPriority, TaskStatus } from '@prisma/client';
import { EventsService } from '../events/events.service';
import { StockService } from '../inventory/stock.service';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../sequence/sequence.service';
import { CompleteTaskDto, CreateTaskDto, GenerateTasksDto, TaskQuery } from './replenishment.dto';
import { computeReplenishment, ReserveStock } from './replenishment.logic';

const PRIORITY_ORDER: Record<TaskPriority, number> = { URGENT: 0, HIGH: 1, NORMAL: 2 };
const STATUS_ORDER = { NO_RESERVE: 1, REQUIRED: 0, IN_PROGRESS: 2, OK: 3 };

@Injectable()
export class ReplenishmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly sequence: SequenceService,
    private readonly events: EventsService,
  ) {}

  /** Widok "co i gdzie trzeba dołożyć" — wszystkie miejsca kompletacji z wyliczoną potrzebą. */
  async overview() {
    const pickFaces = await this.prisma.pickFace.findMany({
      where: { product: { active: true }, location: { active: true } },
      include: {
        product: { select: { id: true, sku: true, name: true, unit: true, unitsPerCarton: true } },
        location: { select: { id: true, code: true, zone: true } },
      },
    });
    if (!pickFaces.length) return { rows: [], stats: { required: 0, noReserve: 0, inProgress: 0, ok: 0 } };

    const productIds = [...new Set(pickFaces.map((p) => p.productId))];
    const [atPick, openTasks, reserveItems] = await Promise.all([
      this.prisma.stockItem.groupBy({
        by: ['productId', 'locationId'],
        where: { locationId: { in: pickFaces.map((p) => p.locationId) }, quantity: { gt: 0 } },
        _sum: { quantity: true },
      }),
      this.prisma.replenishmentTask.findMany({ where: { status: TaskStatus.OPEN, productId: { in: productIds } } }),
      this.prisma.stockItem.findMany({
        where: { productId: { in: productIds }, quantity: { gt: 0 }, location: { type: LocationType.STORAGE, active: true } },
        include: { location: { select: { code: true } }, handlingUnit: { select: { code: true } } },
      }),
    ]);

    const rows = pickFaces.map((pf) => {
      const current =
        atPick.find((s) => s.productId === pf.productId && s.locationId === pf.locationId)?._sum.quantity ?? 0;
      const tasksForFace = openTasks.filter((t) => t.productId === pf.productId && t.toLocationId === pf.locationId);
      const pending = tasksForFace.reduce((s, t) => s + t.quantity, 0);

      // rezerwa pomniejszona o ilości zaplanowane w otwartych zadaniach (dla dowolnego miejsca kompletacji)
      const planned = (locationId: string, huId: string | null) =>
        openTasks
          .filter((t) => t.productId === pf.productId && t.fromLocationId === locationId && (t.handlingUnitId ?? null) === huId)
          .reduce((s, t) => s + t.quantity, 0);
      const plannedLeft = new Map<string, number>();
      const reserve: ReserveStock[] = reserveItems
        .filter((i) => i.productId === pf.productId)
        .map((i) => {
          const key = `${i.locationId}|${i.handlingUnitId ?? ''}`;
          const left = plannedLeft.has(key) ? plannedLeft.get(key)! : planned(i.locationId, i.handlingUnitId);
          const deduct = Math.min(left, i.quantity);
          plannedLeft.set(key, left - deduct);
          return {
            id: i.id,
            quantity: i.quantity - deduct,
            expiryDate: i.expiryDate,
            receivedAt: i.receivedAt,
            locationId: i.locationId,
            locationCode: i.location.code,
            handlingUnitId: i.handlingUnitId,
            handlingUnitCode: i.handlingUnit?.code ?? null,
            batch: i.batch,
          };
        })
        .filter((r) => r.quantity > 0);

      const calc = computeReplenishment({ current, pending, minQty: pf.minQty, maxQty: pf.maxQty, reserve });
      return {
        pickFaceId: pf.id,
        product: pf.product,
        location: pf.location,
        minQty: pf.minQty,
        maxQty: pf.maxQty,
        current,
        pending,
        openTasks: tasksForFace.map((t) => ({ id: t.id, number: t.number, quantity: t.quantity })),
        ...calc,
      };
    });

    rows.sort(
      (a, b) =>
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
        PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
        a.fillPercent - b.fillPercent,
    );

    return {
      rows,
      stats: {
        required: rows.filter((r) => r.status === 'REQUIRED').length,
        noReserve: rows.filter((r) => r.status === 'NO_RESERVE').length,
        inProgress: rows.filter((r) => r.status === 'IN_PROGRESS').length,
        ok: rows.filter((r) => r.status === 'OK').length,
      },
    };
  }

  /** Generuje zadania uzupełnienia na podstawie sugestii. */
  async generate(dto: GenerateTasksDto, userId: string) {
    const { rows } = await this.overview();
    const selected = rows.filter(
      (r) => r.status === 'REQUIRED' && (!dto.pickFaceIds?.length || dto.pickFaceIds.includes(r.pickFaceId)),
    );
    const created = await this.prisma.$transaction(async (tx) => {
      const tasks = [];
      for (const row of selected) {
        for (const s of row.suggestions) {
          tasks.push(
            await tx.replenishmentTask.create({
              data: {
                number: await this.sequence.documentNumber(tx, 'RPL'),
                productId: row.product.id,
                fromLocationId: s.fromLocationId,
                toLocationId: row.location.id,
                handlingUnitId: s.handlingUnitId,
                quantity: s.quantity,
                priority: row.priority,
                createdById: userId,
              },
            }),
          );
        }
      }
      return tasks;
    });
    if (created.length) this.events.emit('replenishment.changed');
    return { created: created.length, tasks: created };
  }

  async createTask(dto: CreateTaskDto, userId: string) {
    const [from, to] = await Promise.all([
      this.prisma.location.findUniqueOrThrow({ where: { id: dto.fromLocationId } }),
      this.prisma.location.findUniqueOrThrow({ where: { id: dto.toLocationId } }),
    ]);
    if (from.id === to.id) throw new BadRequestException('Lokalizacja źródłowa i docelowa muszą się różnić');
    if (to.type !== LocationType.PICKING) throw new BadRequestException('Uzupełniać można tylko lokalizacje kompletacyjne');
    const available = await this.prisma.stockItem.aggregate({
      where: { productId: dto.productId, locationId: from.id, ...(dto.handlingUnitId ? { handlingUnitId: dto.handlingUnitId } : {}) },
      _sum: { quantity: true },
    });
    if ((available._sum.quantity ?? 0) < dto.quantity) {
      throw new BadRequestException(`W lokalizacji ${from.code} dostępne jest tylko ${available._sum.quantity ?? 0}`);
    }
    const current = await this.prisma.stockItem.aggregate({
      where: { productId: dto.productId, locationId: to.id },
      _sum: { quantity: true },
    });
    const pf = await this.prisma.pickFace.findUnique({
      where: { productId_locationId: { productId: dto.productId, locationId: to.id } },
    });
    const task = await this.prisma.$transaction(async (tx) =>
      tx.replenishmentTask.create({
        data: {
          ...dto,
          number: await this.sequence.documentNumber(tx, 'RPL'),
          priority: pf ? computeReplenishment({ current: current._sum.quantity ?? 0, pending: 0, minQty: pf.minQty, maxQty: pf.maxQty, reserve: [] }).priority : TaskPriority.NORMAL,
          createdById: userId,
        },
      }),
    );
    this.events.emit('replenishment.changed');
    return task;
  }

  listTasks(q: TaskQuery) {
    return this.prisma.replenishmentTask.findMany({
      where: { status: q.status ?? TaskStatus.OPEN },
      include: {
        product: { select: { id: true, sku: true, name: true, unit: true } },
        fromLocation: { select: { code: true } },
        toLocation: { select: { code: true } },
        handlingUnit: { select: { code: true } },
        createdBy: { select: { name: true } },
        completedBy: { select: { name: true } },
      },
      orderBy: q.status && q.status !== TaskStatus.OPEN ? { completedAt: 'desc' } : [{ priority: 'asc' }, { createdAt: 'asc' }],
      take: 200,
    });
  }

  /** Wykonanie zadania: przeniesienie towaru z rezerwy na miejsce kompletacji (luzem, bez palety). */
  completeTask(id: string, dto: CompleteTaskDto, userId: string) {
    return this.stock.run(async (tx, touched) => {
      const task = await tx.replenishmentTask.findUnique({ where: { id } });
      if (!task) throw new NotFoundException('Nie znaleziono zadania');
      if (task.status !== TaskStatus.OPEN) throw new BadRequestException('Zadanie zostało już zamknięte');
      const quantity = dto.quantity ?? task.quantity;

      const items = await tx.stockItem.findMany({
        where: {
          productId: task.productId,
          locationId: task.fromLocationId,
          quantity: { gt: 0 },
          ...(task.handlingUnitId ? { handlingUnitId: task.handlingUnitId } : {}),
        },
        orderBy: [{ expiryDate: 'asc' }, { receivedAt: 'asc' }],
      });
      let remaining = quantity;
      for (const item of items) {
        if (remaining <= 0) break;
        const qty = Math.min(item.quantity, remaining);
        await this.stock.moveItem(tx, {
          stockItemId: item.id,
          quantity: qty,
          toLocationId: task.toLocationId,
          toHandlingUnitId: null,
          type: MovementType.REPLENISHMENT,
          userId,
          documentNo: task.number,
        });
        remaining -= qty;
      }
      if (remaining > 0) {
        throw new BadRequestException(`W lokalizacji źródłowej brakuje ${remaining} szt. — zmniejsz ilość lub anuluj zadanie`);
      }
      touched.add(task.productId);
      return tx.replenishmentTask.update({
        where: { id },
        data: { status: TaskStatus.DONE, quantity, completedById: userId, completedAt: new Date() },
      });
    });
  }

  async cancelTask(id: string) {
    const task = await this.prisma.replenishmentTask.update({
      where: { id, status: TaskStatus.OPEN },
      data: { status: TaskStatus.CANCELLED, completedAt: new Date() },
    });
    this.events.emit('replenishment.changed');
    return task;
  }
}
