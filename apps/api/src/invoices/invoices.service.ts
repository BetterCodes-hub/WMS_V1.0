import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceStatus, InvoiceType, IssueStatus, PaymentMethod, Prisma, ReceiptStatus } from '@prisma/client';
import { paginated } from '../common/pagination';
import { Tx } from '../common/types';
import { amountInWords } from '../common/utils/amount-in-words';
import { addDays, startOfDay } from '../common/utils/dates';
import { lineAmounts, totals, vatBreakdown } from '../common/utils/money';
import { EventsService } from '../events/events.service';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../sequence/sequence.service';
import { SettingsService } from '../settings/settings.service';
import { FromIssuesDto, InvoiceQuery, ManualInvoiceDto, MarkPaidDto, PurchaseFromReceiptDto } from './invoices.dto';

const UNIT_LABELS: Record<string, string> = { PCS: 'szt.', PACK: 'opak.', ROLL: 'rol.', SET: 'kpl.', KG: 'kg' };

interface DraftLine {
  productId?: string | null;
  name: string;
  unit: string;
  quantity: number;
  unitNet: number;
  vatRate: number;
}

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
    private readonly settings: SettingsService,
    private readonly events: EventsService,
  ) {}

  async findAll(q: InvoiceQuery) {
    const today = startOfDay(new Date());
    const where: Prisma.InvoiceWhereInput = {
      ...(q.type ? { type: q.type } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.contractorId ? { contractorId: q.contractorId } : {}),
      ...(q.overdue ? { status: InvoiceStatus.ISSUED, dueDate: { lt: today } } : {}),
      ...(q.from || q.to
        ? { issueDate: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lt: addDays(new Date(q.to), 1) } : {}) } }
        : {}),
      ...(q.search
        ? {
            OR: [
              { number: { contains: q.search, mode: 'insensitive' } },
              { externalNumber: { contains: q.search, mode: 'insensitive' } },
              { contractor: { name: { contains: q.search, mode: 'insensitive' } } },
              { contractor: { nip: { contains: q.search } } },
            ],
          }
        : {}),
    };
    const [items, total, sums] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where,
        include: { contractor: { select: { id: true, name: true, nip: true } } },
        orderBy: [{ issueDate: 'desc' }, { number: 'desc' }],
        skip: q.skip,
        take: q.pageSize,
      }),
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.aggregate({
        where: { ...where, status: { not: InvoiceStatus.CANCELLED } },
        _sum: { netTotal: true, vatTotal: true, grossTotal: true },
      }),
    ]);
    return {
      ...paginated(
        items.map((i) => ({ ...i, overdue: i.status === InvoiceStatus.ISSUED && i.dueDate < today })),
        total,
        q,
      ),
      sums: { net: sums._sum.netTotal ?? 0, vat: sums._sum.vatTotal ?? 0, gross: sums._sum.grossTotal ?? 0 },
    };
  }

  async findOne(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        contractor: true,
        lines: { orderBy: { id: 'asc' } },
        goodsIssues: { select: { id: true, number: true, issueDate: true } },
        receipt: { select: { id: true, number: true, lines: { select: { receivedQty: true, unitPrice: true } } } },
        createdBy: { select: { name: true } },
      },
    });
    if (!invoice) throw new NotFoundException('Nie znaleziono faktury');
    const breakdown = vatBreakdown(invoice.lines);
    const receiptValue = invoice.receipt?.lines.reduce((s, l) => s + l.receivedQty * l.unitPrice, 0) ?? null;
    return {
      ...invoice,
      breakdown,
      amountInWords: amountInWords(invoice.grossTotal),
      overdue: invoice.status === InvoiceStatus.ISSUED && invoice.dueDate < startOfDay(new Date()),
      // rozliczenie faktury zakupowej z dokumentem PZ
      receiptValue,
      receiptDifference: receiptValue !== null ? invoice.netTotal - receiptValue : null,
      seller: invoice.type === InvoiceType.SALES ? await this.settings.get() : null,
    };
  }

  /** Faktura sprzedaży do jednego lub wielu dokumentów WZ tego samego odbiorcy. */
  async createFromIssues(dto: FromIssuesDto, userId: string) {
    const invoice = await this.prisma.$transaction(async (tx) => {
      const issues = await tx.goodsIssue.findMany({
        where: { id: { in: dto.issueIds } },
        include: { lines: { include: { product: true } }, customer: true },
        orderBy: { issueDate: 'asc' },
      });
      if (issues.length !== dto.issueIds.length) throw new NotFoundException('Nie znaleziono części dokumentów WZ');
      if (issues.some((i) => i.status !== IssueStatus.CONFIRMED)) {
        throw new BadRequestException('Fakturować można tylko zatwierdzone dokumenty WZ');
      }
      if (issues.some((i) => i.invoiceId)) throw new BadRequestException('Część dokumentów WZ jest już zafakturowana');
      const customerIds = new Set(issues.map((i) => i.customerId));
      if (customerIds.size > 1) throw new BadRequestException('Dokumenty WZ muszą dotyczyć tego samego odbiorcy');

      // agregacja pozycji: produkt + cena + stawka
      const merged = new Map<string, DraftLine>();
      for (const issue of issues) {
        for (const l of issue.lines) {
          const key = `${l.productId}|${l.unitPrice}|${l.vatRate}`;
          const existing = merged.get(key);
          if (existing) existing.quantity += l.quantity;
          else
            merged.set(key, {
              productId: l.productId,
              name: l.product.name,
              unit: UNIT_LABELS[l.product.unit] ?? l.product.unit,
              quantity: l.quantity,
              unitNet: l.unitPrice,
              vatRate: l.vatRate,
            });
        }
      }

      const issueDate = dto.issueDate ? new Date(dto.issueDate) : new Date();
      const customer = issues[0].customer;
      const invoice = await this.createInvoice(tx, {
        type: InvoiceType.SALES,
        contractorId: customer.id,
        issueDate,
        saleDate: dto.saleDate ? new Date(dto.saleDate) : issues[issues.length - 1].issueDate,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : await this.defaultDueDate(issueDate, customer.paymentDays),
        paymentMethod: dto.paymentMethod ?? PaymentMethod.TRANSFER,
        notes: dto.notes ?? `Dotyczy: ${issues.map((i) => i.number).join(', ')}`,
        lines: [...merged.values()],
        userId,
      });
      await tx.goodsIssue.updateMany({ where: { id: { in: dto.issueIds } }, data: { invoiceId: invoice.id } });
      return invoice;
    });
    this.events.emit('invoice.changed', { id: invoice.id });
    return invoice;
  }

  /** Faktura sprzedaży wystawiana ręcznie (np. usługi magazynowe). */
  async createManual(dto: ManualInvoiceDto, userId: string) {
    const contractor = await this.prisma.contractor.findUniqueOrThrow({ where: { id: dto.contractorId } });
    const issueDate = new Date(dto.issueDate);
    const invoice = await this.prisma.$transaction(async (tx) =>
      this.createInvoice(tx, {
        type: InvoiceType.SALES,
        contractorId: contractor.id,
        issueDate,
        saleDate: new Date(dto.saleDate),
        dueDate: dto.dueDate ? new Date(dto.dueDate) : await this.defaultDueDate(issueDate, contractor.paymentDays),
        paymentMethod: dto.paymentMethod ?? PaymentMethod.TRANSFER,
        notes: dto.notes,
        lines: dto.lines,
        userId,
      }),
    );
    this.events.emit('invoice.changed', { id: invoice.id });
    return invoice;
  }

  /** Rejestracja faktury zakupowej i rozliczenie jej z dokumentem PZ. */
  async createPurchase(dto: PurchaseFromReceiptDto, userId: string) {
    const invoice = await this.prisma.$transaction(async (tx) => {
      const receipt = await tx.goodsReceipt.findUnique({
        where: { id: dto.receiptId },
        include: { lines: { include: { product: true } }, supplier: true },
      });
      if (!receipt) throw new NotFoundException('Nie znaleziono przyjęcia');
      if (receipt.status !== ReceiptStatus.COMPLETED) throw new BadRequestException('Przyjęcie musi być zakończone');
      if (receipt.purchaseInvoiceId) throw new BadRequestException('Do tego przyjęcia zarejestrowano już fakturę');

      const prices = new Map(dto.prices?.map((p) => [p.receiptLineId, p.unitNet]));
      const issueDate = new Date(dto.issueDate);
      const invoice = await this.createInvoice(tx, {
        type: InvoiceType.PURCHASE,
        externalNumber: dto.externalNumber,
        contractorId: receipt.supplierId,
        issueDate,
        saleDate: receipt.completedAt ?? issueDate,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : addDays(issueDate, receipt.supplier.paymentDays ?? 14),
        paymentMethod: dto.paymentMethod ?? PaymentMethod.TRANSFER,
        notes: dto.notes ?? `Dotyczy: ${receipt.number}`,
        lines: receipt.lines
          .filter((l) => l.receivedQty > 0)
          .map((l) => ({
            productId: l.productId,
            name: l.product.name,
            unit: UNIT_LABELS[l.product.unit] ?? l.product.unit,
            quantity: l.receivedQty,
            unitNet: prices.get(l.id) ?? l.unitPrice,
            vatRate: l.product.vatRate,
          })),
        userId,
      });
      await tx.goodsReceipt.update({ where: { id: receipt.id }, data: { purchaseInvoiceId: invoice.id } });
      return invoice;
    });
    this.events.emit('invoice.changed', { id: invoice.id });
    return this.findOne(invoice.id);
  }

  async markPaid(id: string, dto: MarkPaidDto) {
    const inv = await this.prisma.invoice.findUniqueOrThrow({ where: { id } });
    if (inv.status !== InvoiceStatus.ISSUED) throw new BadRequestException('Faktura nie oczekuje na płatność');
    this.events.emit('invoice.changed', { id });
    return this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.PAID, paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date() },
    });
  }

  async markUnpaid(id: string) {
    const inv = await this.prisma.invoice.findUniqueOrThrow({ where: { id } });
    if (inv.status !== InvoiceStatus.PAID) throw new BadRequestException('Faktura nie jest opłacona');
    this.events.emit('invoice.changed', { id });
    return this.prisma.invoice.update({ where: { id }, data: { status: InvoiceStatus.ISSUED, paidAt: null } });
  }

  /** Anulowanie faktury zwalnia powiązane WZ / PZ do ponownego rozliczenia. */
  async cancel(id: string) {
    const inv = await this.prisma.invoice.findUniqueOrThrow({ where: { id } });
    if (inv.status === InvoiceStatus.CANCELLED) throw new BadRequestException('Faktura jest już anulowana');
    if (inv.status === InvoiceStatus.PAID) throw new BadRequestException('Nie można anulować opłaconej faktury');
    await this.prisma.$transaction([
      this.prisma.goodsIssue.updateMany({ where: { invoiceId: id }, data: { invoiceId: null } }),
      this.prisma.goodsReceipt.updateMany({ where: { purchaseInvoiceId: id }, data: { purchaseInvoiceId: null } }),
      this.prisma.invoice.update({ where: { id }, data: { status: InvoiceStatus.CANCELLED } }),
    ]);
    this.events.emit('invoice.changed', { id });
    return this.findOne(id);
  }

  private async defaultDueDate(issueDate: Date, contractorDays?: number | null) {
    const days = contractorDays ?? (await this.settings.get()).invoicePaymentDays;
    return addDays(issueDate, days);
  }

  private async createInvoice(
    tx: Tx,
    p: {
      type: InvoiceType;
      externalNumber?: string;
      contractorId: string;
      issueDate: Date;
      saleDate: Date;
      dueDate: Date;
      paymentMethod: PaymentMethod;
      notes?: string;
      lines: DraftLine[];
      userId: string;
    },
  ) {
    if (p.dueDate < startOfDay(p.issueDate)) throw new BadRequestException('Termin płatności nie może poprzedzać daty wystawienia');
    const lines = p.lines.map((l) => ({ ...l, productId: l.productId ?? null, ...lineAmounts(l.quantity, l.unitNet, l.vatRate) }));
    const sum = totals(vatBreakdown(lines));
    return tx.invoice.create({
      data: {
        number: await this.sequence.documentNumber(tx, p.type === InvoiceType.SALES ? 'FV' : 'FZ', p.issueDate),
        type: p.type,
        externalNumber: p.externalNumber,
        contractorId: p.contractorId,
        issueDate: p.issueDate,
        saleDate: p.saleDate,
        dueDate: p.dueDate,
        paymentMethod: p.paymentMethod,
        notes: p.notes,
        netTotal: sum.net,
        vatTotal: sum.vat,
        grossTotal: sum.gross,
        createdById: p.userId,
        lines: { create: lines },
      },
    });
  }
}
