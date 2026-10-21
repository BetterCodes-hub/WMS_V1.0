import { Injectable } from '@nestjs/common';
import { InvoiceStatus, InvoiceType, IssueStatus, ReceiptStatus } from '@prisma/client';
import { csvMoney, toCsv } from '../common/utils/csv';
import { addDays, formatDatePl, startOfDay } from '../common/utils/dates';
import { vatBreakdown } from '../common/utils/money';
import { PrismaService } from '../prisma/prisma.service';
import { ExportQuery, PeriodQuery } from './accounting.dto';

const STATUS_PL: Record<InvoiceStatus, string> = { ISSUED: 'Wystawiona', PAID: 'Opłacona', CANCELLED: 'Anulowana' };

@Injectable()
export class AccountingService {
  constructor(private readonly prisma: PrismaService) {}

  private period(q: PeriodQuery) {
    const now = new Date();
    const from = q.from ? new Date(q.from) : new Date(now.getFullYear(), now.getMonth(), 1);
    const to = q.to ? new Date(q.to) : now;
    return { from: startOfDay(from), toExclusive: addDays(startOfDay(to), 1) };
  }

  /** Zestawienie okresu: sprzedaż, zakupy, VAT należny/naliczony, marża na WZ, należności. */
  async summary(q: PeriodQuery) {
    const { from, toExclusive } = this.period(q);
    const today = startOfDay(new Date());

    const invoices = await this.prisma.invoice.findMany({
      where: { issueDate: { gte: from, lt: toExclusive }, status: { not: InvoiceStatus.CANCELLED } },
      include: { lines: { select: { net: true, vatRate: true } } },
    });
    const byType = (type: InvoiceType) => invoices.filter((i) => i.type === type);
    const sumOf = (list: typeof invoices) => ({
      count: list.length,
      net: list.reduce((s, i) => s + i.netTotal, 0),
      vat: list.reduce((s, i) => s + i.vatTotal, 0),
      gross: list.reduce((s, i) => s + i.grossTotal, 0),
      // VAT wg stawek — suma rozbić poszczególnych faktur
      byRate: Object.values(
        list
          .flatMap((i) => vatBreakdown(i.lines))
          .reduce<Record<number, { vatRate: number; net: number; vat: number; gross: number }>>((acc, r) => {
            const e = (acc[r.vatRate] ??= { vatRate: r.vatRate, net: 0, vat: 0, gross: 0 });
            e.net += r.net;
            e.vat += r.vat;
            e.gross += r.gross;
            return acc;
          }, {}),
      ).sort((a, b) => b.vatRate - a.vatRate),
    });
    const sales = sumOf(byType(InvoiceType.SALES));
    const purchases = sumOf(byType(InvoiceType.PURCHASE));

    const issueLines = await this.prisma.goodsIssueLine.findMany({
      where: { issue: { status: IssueStatus.CONFIRMED, issueDate: { gte: from, lt: toExclusive } } },
      select: { quantity: true, unitPrice: true, unitCost: true },
    });
    const issuesNet = issueLines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
    const issuesCost = issueLines.reduce((s, l) => s + l.quantity * l.unitCost, 0);

    const receiptLines = await this.prisma.goodsReceiptLine.findMany({
      where: { receipt: { status: ReceiptStatus.COMPLETED, completedAt: { gte: from, lt: toExclusive } } },
      select: { receivedQty: true, unitPrice: true },
    });

    const open = await this.prisma.invoice.findMany({
      where: { status: InvoiceStatus.ISSUED },
      select: { type: true, grossTotal: true, dueDate: true },
    });
    const openSum = (type: InvoiceType, overdue: boolean) =>
      open.filter((i) => i.type === type && (!overdue || i.dueDate < today)).reduce((s, i) => s + i.grossTotal, 0);

    return {
      period: { from, to: addDays(toExclusive, -1) },
      sales,
      purchases,
      vatDue: sales.vat - purchases.vat,
      goodsIssues: {
        net: issuesNet,
        cost: issuesCost,
        margin: issuesNet - issuesCost,
        marginPercent: issuesNet ? Math.round(((issuesNet - issuesCost) / issuesNet) * 1000) / 10 : 0,
      },
      goodsReceiptsValue: receiptLines.reduce((s, l) => s + l.receivedQty * l.unitPrice, 0),
      receivables: { total: openSum(InvoiceType.SALES, false), overdue: openSum(InvoiceType.SALES, true) },
      payables: { total: openSum(InvoiceType.PURCHASE, false), overdue: openSum(InvoiceType.PURCHASE, true) },
    };
  }

  /** Dokumenty wymagające rozliczenia: WZ bez faktury sprzedaży, PZ bez faktury zakupowej. */
  async pending() {
    const [issues, receipts] = await Promise.all([
      this.prisma.goodsIssue.findMany({
        where: { status: IssueStatus.CONFIRMED, invoiceId: null },
        include: {
          customer: { select: { id: true, name: true } },
          lines: { select: { quantity: true, unitPrice: true } },
        },
        orderBy: { issueDate: 'asc' },
      }),
      this.prisma.goodsReceipt.findMany({
        where: { status: ReceiptStatus.COMPLETED, purchaseInvoiceId: null },
        include: {
          supplier: { select: { id: true, name: true } },
          lines: { select: { receivedQty: true, unitPrice: true } },
        },
        orderBy: { completedAt: 'asc' },
      }),
    ]);
    return {
      issues: issues.map(({ lines, ...i }) => ({ ...i, netValue: lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0) })),
      receipts: receipts.map(({ lines, ...r }) => ({
        ...r,
        value: lines.reduce((s, l) => s + l.receivedQty * l.unitPrice, 0),
      })),
    };
  }

  /** Rejestr faktur (sprzedaży / zakupu) do CSV — import w programie księgowym / arkuszu. */
  async exportInvoices(q: ExportQuery) {
    const { from, toExclusive } = this.period(q);
    const invoices = await this.prisma.invoice.findMany({
      where: { issueDate: { gte: from, lt: toExclusive }, ...(q.type ? { type: q.type } : {}) },
      include: { contractor: true, lines: { select: { net: true, vatRate: true } } },
      orderBy: [{ type: 'asc' }, { issueDate: 'asc' }, { number: 'asc' }],
    });
    const rates = [23, 8, 5, 0];
    const headers = [
      'Typ', 'Numer', 'Numer obcy', 'Data wystawienia', 'Data sprzedaży', 'Termin płatności', 'Kontrahent', 'NIP',
      ...rates.flatMap((r) => [`Netto ${r}%`, `VAT ${r}%`]),
      'Netto', 'VAT', 'Brutto', 'Status', 'Data zapłaty',
    ];
    const rows = invoices.map((i) => {
      const cancelled = i.status === InvoiceStatus.CANCELLED;
      const br = vatBreakdown(i.lines);
      const m = (v: number) => csvMoney(cancelled ? 0 : v);
      return [
        i.type === InvoiceType.SALES ? 'Sprzedaż' : 'Zakup',
        i.number,
        i.externalNumber ?? '',
        formatDatePl(i.issueDate),
        formatDatePl(i.saleDate),
        formatDatePl(i.dueDate),
        i.contractor.name,
        i.contractor.nip ?? '',
        ...rates.flatMap((r) => {
          const row = br.find((b) => b.vatRate === r);
          return [m(row?.net ?? 0), m(row?.vat ?? 0)];
        }),
        m(i.netTotal),
        m(i.vatTotal),
        m(i.grossTotal),
        STATUS_PL[i.status],
        formatDatePl(i.paidAt),
      ];
    });
    return toCsv(headers, rows);
  }

  /** Rejestr dokumentów magazynowych (PZ / WZ) z wartościami. */
  async exportDocuments(q: PeriodQuery) {
    const { from, toExclusive } = this.period(q);
    const [receipts, issues] = await Promise.all([
      this.prisma.goodsReceipt.findMany({
        where: { status: ReceiptStatus.COMPLETED, completedAt: { gte: from, lt: toExclusive } },
        include: { supplier: true, lines: true, purchaseInvoice: { select: { number: true } } },
        orderBy: { completedAt: 'asc' },
      }),
      this.prisma.goodsIssue.findMany({
        where: { status: IssueStatus.CONFIRMED, issueDate: { gte: from, lt: toExclusive } },
        include: { customer: true, lines: true, invoice: { select: { number: true } } },
        orderBy: { issueDate: 'asc' },
      }),
    ]);
    const headers = ['Dokument', 'Numer', 'Data', 'Kontrahent', 'NIP', 'Ilość', 'Wartość (cena zakupu)', 'Wartość sprzedaży netto', 'Faktura'];
    const rows = [
      ...receipts.map((r) => [
        'PZ', r.number, formatDatePl(r.completedAt), r.supplier.name, r.supplier.nip ?? '',
        r.lines.reduce((s, l) => s + l.receivedQty, 0),
        csvMoney(r.lines.reduce((s, l) => s + l.receivedQty * l.unitPrice, 0)),
        '', r.purchaseInvoice?.number ?? '',
      ]),
      ...issues.map((i) => [
        'WZ', i.number, formatDatePl(i.issueDate), i.customer.name, i.customer.nip ?? '',
        i.lines.reduce((s, l) => s + l.quantity, 0),
        csvMoney(i.lines.reduce((s, l) => s + l.quantity * l.unitCost, 0)),
        csvMoney(i.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0)),
        i.invoice?.number ?? '',
      ]),
    ];
    return toCsv(headers, rows);
  }
}
