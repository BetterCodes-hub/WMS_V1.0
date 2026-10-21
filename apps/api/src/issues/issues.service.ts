import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { HandlingUnitStatus, IssueStatus, LocationType, MovementType, Prisma } from '@prisma/client';
import { paginated } from '../common/pagination';
import { lineAmounts } from '../common/utils/money';
import { EventsService } from '../events/events.service';
import { StockService } from '../inventory/stock.service';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../sequence/sequence.service';
import { CreateIssueDto, IssueLineDto, IssueQuery, UpdateIssueDto } from './issues.dto';

@Injectable()
export class IssuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly sequence: SequenceService,
    private readonly events: EventsService,
  ) {}

  async findAll(q: IssueQuery) {
    const where: Prisma.GoodsIssueWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.customerId ? { customerId: q.customerId } : {}),
      ...(q.uninvoiced ? { status: IssueStatus.CONFIRMED, invoiceId: null } : {}),
      ...(q.search
        ? {
            OR: [
              { number: { contains: q.search, mode: 'insensitive' } },
              { customer: { name: { contains: q.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [issues, total] = await this.prisma.$transaction([
      this.prisma.goodsIssue.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true } },
          invoice: { select: { id: true, number: true } },
          lines: { select: { quantity: true, unitPrice: true, unitCost: true, vatRate: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: q.skip,
        take: q.pageSize,
      }),
      this.prisma.goodsIssue.count({ where }),
    ]);
    const items = issues.map(({ lines, ...i }) => ({
      ...i,
      lineCount: lines.length,
      totalQty: lines.reduce((s, l) => s + l.quantity, 0),
      netValue: lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0),
      costValue: lines.reduce((s, l) => s + l.quantity * l.unitCost, 0),
    }));
    return paginated(items, total, q);
  }

  async findOne(id: string) {
    const issue = await this.prisma.goodsIssue.findUnique({
      where: { id },
      include: {
        customer: true,
        createdBy: { select: { name: true } },
        invoice: { select: { id: true, number: true, status: true } },
        lines: {
          include: {
            product: { select: { id: true, sku: true, name: true, unit: true, ean: true, avgCost: true } },
            allocations: true,
          },
        },
      },
    });
    if (!issue) throw new NotFoundException('Nie znaleziono dokumentu WZ');

    // dla szkiców — dostępność towaru
    const available = new Map<string, number>();
    if (issue.status === IssueStatus.DRAFT) {
      const rows = await this.prisma.stockItem.groupBy({
        by: ['productId'],
        where: {
          productId: { in: issue.lines.map((l) => l.productId) },
          location: { type: { notIn: [LocationType.QUARANTINE] }, active: true },
        },
        _sum: { quantity: true },
      });
      rows.forEach((r) => available.set(r.productId, r._sum.quantity ?? 0));
    }

    const lines = issue.lines.map((l) => ({
      ...l,
      ...lineAmounts(l.quantity, l.unitPrice, l.vatRate),
      costValue: l.quantity * (issue.status === IssueStatus.DRAFT ? l.product.avgCost : l.unitCost),
      available: issue.status === IssueStatus.DRAFT ? (available.get(l.productId) ?? 0) : null,
    }));
    return {
      ...issue,
      lines,
      totals: {
        quantity: lines.reduce((s, l) => s + l.quantity, 0),
        net: lines.reduce((s, l) => s + l.net, 0),
        vat: lines.reduce((s, l) => s + l.vat, 0),
        gross: lines.reduce((s, l) => s + l.gross, 0),
        cost: lines.reduce((s, l) => s + l.costValue, 0),
      },
      canConfirm: issue.status === IssueStatus.DRAFT && lines.every((l) => (l.available ?? 0) >= l.quantity),
    };
  }

  async create(dto: CreateIssueDto, userId: string) {
    await this.assertCustomer(dto.customerId);
    const lines = await this.prepareLines(dto.lines);
    const issue = await this.prisma.$transaction(async (tx) =>
      tx.goodsIssue.create({
        data: {
          number: await this.sequence.documentNumber(tx, 'WZ'),
          customerId: dto.customerId,
          issueDate: dto.issueDate ? new Date(dto.issueDate) : new Date(),
          notes: dto.notes,
          createdById: userId,
          lines: { create: lines },
        },
      }),
    );
    this.events.emit('issue.changed', { id: issue.id });
    return issue;
  }

  async update(id: string, dto: UpdateIssueDto) {
    const issue = await this.prisma.goodsIssue.findUniqueOrThrow({ where: { id } });
    if (issue.status !== IssueStatus.DRAFT) throw new BadRequestException('Edytować można tylko szkic WZ');
    await this.assertCustomer(dto.customerId);
    const lines = await this.prepareLines(dto.lines);
    await this.prisma.$transaction([
      this.prisma.goodsIssueLine.deleteMany({ where: { issueId: id } }),
      this.prisma.goodsIssue.update({
        where: { id },
        data: {
          customerId: dto.customerId,
          issueDate: dto.issueDate ? new Date(dto.issueDate) : issue.issueDate,
          notes: dto.notes,
          lines: { create: lines },
        },
      }),
    ]);
    return this.findOne(id);
  }

  /** Zatwierdzenie WZ: fizyczne zdjęcie towaru ze stanu wg FEFO i wycena po średnim koszcie. */
  async confirm(id: string, userId: string) {
    await this.stock.run(async (tx, touched) => {
      const issue = await tx.goodsIssue.findUnique({ where: { id }, include: { lines: { include: { product: true } } } });
      if (!issue) throw new NotFoundException('Nie znaleziono dokumentu WZ');
      if (issue.status !== IssueStatus.DRAFT) throw new BadRequestException('Dokument został już zatwierdzony lub anulowany');

      for (const line of issue.lines) {
        const allocations = await this.stock.pickFefo(tx, {
          productId: line.productId,
          quantity: line.quantity,
          userId,
          type: MovementType.ISSUE,
          documentNo: issue.number,
        });
        await tx.goodsIssueLine.update({
          where: { id: line.id },
          data: { unitCost: line.product.avgCost, allocations: { create: allocations } },
        });
        touched.add(line.productId);
      }
      await tx.goodsIssue.update({
        where: { id },
        data: { status: IssueStatus.CONFIRMED, confirmedAt: new Date() },
      });
    });
    this.events.emit('issue.changed', { id });
    return this.findOne(id);
  }

  async cancel(id: string) {
    const issue = await this.prisma.goodsIssue.findUniqueOrThrow({ where: { id } });
    if (issue.status !== IssueStatus.DRAFT) {
      throw new BadRequestException('Anulować można tylko szkic — zatwierdzony dokument wymaga storna');
    }
    this.events.emit('issue.changed', { id });
    return this.prisma.goodsIssue.update({ where: { id }, data: { status: IssueStatus.CANCELLED } });
  }

  /**
   * Storno zatwierdzonego WZ: zwrot towaru do lokalizacji (i na jednostki), z których został pobrany.
   * Niedozwolone dla dokumentów zafakturowanych.
   */
  async reverse(id: string, userId: string) {
    await this.stock.run(async (tx, touched) => {
      const issue = await tx.goodsIssue.findUnique({
        where: { id },
        include: { lines: { include: { allocations: true } } },
      });
      if (!issue) throw new NotFoundException('Nie znaleziono dokumentu WZ');
      if (issue.status !== IssueStatus.CONFIRMED) throw new BadRequestException('Stornować można tylko zatwierdzony WZ');
      if (issue.invoiceId) throw new BadRequestException('Dokument jest zafakturowany — najpierw anuluj fakturę');

      for (const line of issue.lines) {
        for (const a of line.allocations) {
          const location = await tx.location.findUnique({ where: { code: a.locationCode } });
          if (!location) throw new BadRequestException(`Lokalizacja ${a.locationCode} nie istnieje`);
          const hu = a.handlingUnitCode
            ? await tx.handlingUnit.findUnique({ where: { code: a.handlingUnitCode } })
            : null;
          // jednostka mogła w międzyczasie zostać przeniesiona — wtedy zwrot luzem do lokalizacji
          const huId = hu && hu.locationId === location.id ? hu.id : null;
          if (huId && hu!.status === HandlingUnitStatus.EMPTY) {
            await tx.handlingUnit.update({ where: { id: huId }, data: { status: HandlingUnitStatus.ACTIVE } });
          }
          await this.stock.add(tx, {
            productId: line.productId,
            locationId: location.id,
            handlingUnitId: huId,
            batch: a.batch,
            expiryDate: a.expiryDate,
            quantity: a.quantity,
          });
          await this.stock.movement(tx, {
            type: MovementType.ADJUSTMENT_PLUS,
            productId: line.productId,
            quantity: a.quantity,
            userId,
            toLocationId: location.id,
            handlingUnitId: huId,
            batch: a.batch,
            documentNo: issue.number,
            reason: 'Storno WZ',
          });
          if (huId) await this.stock.refreshHandlingUnits(tx, [huId]);
        }
        touched.add(line.productId);
      }
      await tx.goodsIssue.update({ where: { id }, data: { status: IssueStatus.CANCELLED } });
    });
    this.events.emit('issue.changed', { id });
    return this.findOne(id);
  }

  private async assertCustomer(id: string) {
    const c = await this.prisma.contractor.findUnique({ where: { id } });
    if (!c || c.type === 'SUPPLIER') throw new BadRequestException('Wybierz odbiorcę (kontrahent typu odbiorca)');
  }

  private async prepareLines(lines: IssueLineDto[]) {
    const products = await this.prisma.product.findMany({ where: { id: { in: lines.map((l) => l.productId) } } });
    const ids = lines.map((l) => l.productId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Produkt występuje na dokumencie więcej niż raz');
    return lines.map((l) => {
      const p = products.find((x) => x.id === l.productId);
      if (!p) throw new BadRequestException('Nieznany produkt na pozycji WZ');
      return {
        productId: p.id,
        quantity: l.quantity,
        unitPrice: l.unitPrice ?? p.salePrice,
        vatRate: l.vatRate ?? p.vatRate,
      };
    });
  }
}
