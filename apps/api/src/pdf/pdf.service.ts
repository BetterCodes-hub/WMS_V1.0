import { Injectable } from '@nestjs/common';
import * as bwipjs from 'bwip-js';
import type { Content, TDocumentDefinitions, TableCell } from 'pdfmake/interfaces';
import { formatDatePl } from '../common/utils/dates';
import { formatMoney } from '../common/utils/money';
import { SettingsService } from '../settings/settings.service';

// pdfmake (wersja serwerowa) — czcionki Roboto z wbudowanego VFS, obsługują polskie znaki
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PdfPrinter = require('pdfmake');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const vfs: Record<string, string> = require('pdfmake/build/vfs_fonts');

const font = (name: string) => Buffer.from(vfs[name], 'base64');
const printer = new PdfPrinter({
  Roboto: {
    normal: font('Roboto-Regular.ttf'),
    bold: font('Roboto-Medium.ttf'),
    italics: font('Roboto-Italic.ttf'),
    bolditalics: font('Roboto-MediumItalic.ttf'),
  },
});

const UNIT: Record<string, string> = { PCS: 'szt.', PACK: 'opak.', ROLL: 'rol.', SET: 'kpl.', KG: 'kg' };
const PAYMENT: Record<string, string> = { TRANSFER: 'przelew', CASH: 'gotówka', CARD: 'karta' };
const ACCENT = '#1e3a5f';
const MUTED = '#6b7280';
const BORDER = '#d1d5db';

interface Party {
  name: string;
  nip?: string | null;
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
@Injectable()
export class PdfService {
  constructor(private readonly settings: SettingsService) {}

  private render(doc: TDocumentDefinitions): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const pdf = printer.createPdfKitDocument(doc);
      const chunks: Buffer[] = [];
      pdf.on('data', (c: Buffer) => chunks.push(c));
      pdf.on('end', () => resolve(Buffer.concat(chunks)));
      pdf.on('error', reject);
      pdf.end();
    });
  }

  private base(content: Content[], title: string, pageSize: TDocumentDefinitions['pageSize'] = 'A4'): TDocumentDefinitions {
    return {
      pageSize,
      pageMargins: [40, 40, 40, 50],
      info: { title, creator: 'WMS' },
      defaultStyle: { font: 'Roboto', fontSize: 9, lineHeight: 1.15 },
      styles: {
        title: { fontSize: 18, bold: true, color: ACCENT },
        subtitle: { fontSize: 10, color: MUTED },
        label: { fontSize: 7.5, color: MUTED, bold: true, characterSpacing: 0.5 },
        th: { bold: true, fontSize: 8, color: '#ffffff', fillColor: ACCENT },
        small: { fontSize: 7.5, color: MUTED },
      },
      footer: (page, pages) => ({
        margin: [40, 15, 40, 0],
        columns: [
          { text: `${title} · wygenerowano ${new Date().toLocaleString('pl-PL')}`, style: 'small' },
          { text: `Strona ${page} z ${pages}`, alignment: 'right', style: 'small' },
        ],
      }),
      content,
    };
  }

  private party(label: string, p: Party): Content {
    return {
      stack: [
        { text: label.toUpperCase(), style: 'label', margin: [0, 0, 0, 4] },
        { text: p.name, bold: true, fontSize: 10 },
        p.street ? { text: p.street } : '',
        p.postalCode || p.city ? { text: `${p.postalCode ?? ''} ${p.city ?? ''}`.trim() } : '',
        p.nip ? { text: `NIP: ${p.nip}` } : '',
      ],
    };
  }

  private header(title: string, number: string, meta: [string, string][]): Content {
    return {
      columns: [
        { stack: [{ text: title, style: 'title' }, { text: number, fontSize: 13, bold: true, margin: [0, 2, 0, 0] }] },
        {
          width: 'auto',
          table: {
            body: meta.map(([k, v]) => [
              { text: k, style: 'small', alignment: 'right' },
              { text: v, bold: true, alignment: 'right' },
            ]),
          },
          layout: 'noBorders',
        },
      ],
      margin: [0, 0, 0, 20],
    };
  }

  private table(headers: string[], widths: (string | number)[], rows: TableCell[][], rightCols: number[]): Content {
    return {
      table: {
        headerRows: 1,
        widths,
        body: [
          headers.map((h, i): TableCell => ({ text: h, style: 'th', alignment: rightCols.includes(i) ? 'right' : 'left' })),
          ...rows.map((r) =>
            r.map((c, i): TableCell =>
              rightCols.includes(i) && typeof c !== 'object' ? { text: String(c), alignment: 'right' } : c,
            ),
          ),
        ],
      },
      layout: {
        hLineWidth: (i: number, node: any) => (i === 0 || i === 1 || i === node.table.body.length ? 0.8 : 0.4),
        vLineWidth: () => 0,
        hLineColor: () => BORDER,
        paddingTop: () => 4,
        paddingBottom: () => 4,
        fillColor: (row: number) => (row > 0 && row % 2 === 0 ? '#f8fafc' : null),
      },
    };
  }

  private signatures(left: string, right: string): Content {
    const sig = (t: string) => ({
      stack: [
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 180, y2: 0, lineWidth: 0.5, lineColor: MUTED }] },
        { text: t, style: 'small', margin: [0, 3, 0, 0] },
      ],
      width: 180,
    });
    return { columns: [sig(left), { text: '' }, sig(right)], margin: [0, 50, 0, 0] } as Content;
  }

  // ─── Faktura VAT ──────────────────────────────────────────────────────────

  async invoice(inv: any): Promise<Buffer> {
    const company = await this.settings.get();
    const isSales = inv.type === 'SALES';
    const seller: Party = isSales ? company : inv.contractor;
    const buyer: Party = isSales ? inv.contractor : company;
    const title = inv.status === 'CANCELLED' ? 'Faktura VAT (ANULOWANA)' : isSales ? 'Faktura VAT' : 'Faktura zakupowa';

    const lines = inv.lines.map((l: any, i: number) => [
      i + 1,
      l.name,
      l.quantity,
      l.unit,
      formatMoney(l.unitNet),
      formatMoney(l.net),
      `${l.vatRate}%`,
      formatMoney(l.vat),
      formatMoney(l.gross),
    ]);

    const breakdown = this.table(
      ['Stawka', 'Netto', 'VAT', 'Brutto'],
      [50, 70, 70, 70],
      [
        ...inv.breakdown.map((b: any) => [`${b.vatRate}%`, formatMoney(b.net), formatMoney(b.vat), formatMoney(b.gross)]),
        [
          { text: 'Razem', bold: true },
          { text: formatMoney(inv.netTotal), bold: true, alignment: 'right' },
          { text: formatMoney(inv.vatTotal), bold: true, alignment: 'right' },
          { text: formatMoney(inv.grossTotal), bold: true, alignment: 'right' },
        ],
      ],
      [1, 2, 3],
    );

    const content: Content[] = [
      this.header(title, inv.number, [
        ['Data wystawienia', formatDatePl(inv.issueDate)],
        ['Data sprzedaży', formatDatePl(inv.saleDate)],
        ...(inv.externalNumber ? ([['Nr faktury dostawcy', inv.externalNumber]] as [string, string][]) : []),
        ['Miejsce wystawienia', company.city || '—'],
      ]),
      { columns: [this.party('Sprzedawca', seller), this.party('Nabywca', buyer)], margin: [0, 0, 0, 20] },
      this.table(
        ['Lp.', 'Nazwa towaru / usługi', 'Ilość', 'J.m.', 'Cena netto', 'Wartość netto', 'VAT', 'Kwota VAT', 'Wartość brutto'],
        [18, '*', 32, 28, 52, 58, 28, 48, 60],
        lines,
        [0, 2, 4, 5, 6, 7, 8],
      ),
      {
        columns: [
          {
            width: '*',
            stack: [
              { text: 'PŁATNOŚĆ', style: 'label', margin: [0, 0, 0, 4] },
              { text: [{ text: 'Sposób: ', color: MUTED }, PAYMENT[inv.paymentMethod] ?? inv.paymentMethod] },
              { text: [{ text: 'Termin: ', color: MUTED }, formatDatePl(inv.dueDate)] },
              isSales && company.bankAccount
                ? { text: [{ text: 'Konto: ', color: MUTED }, `${company.bankAccount}${company.bankName ? ` (${company.bankName})` : ''}`] }
                : '',
              inv.status === 'PAID' ? { text: `Zapłacono ${formatDatePl(inv.paidAt)}`, bold: true, color: '#15803d', margin: [0, 4, 0, 0] } : '',
            ],
          },
          { width: 'auto', stack: [breakdown] },
        ],
        margin: [0, 16, 0, 0],
      },
      {
        margin: [0, 16, 0, 0],
        table: {
          widths: ['*'],
          body: [
            [
              {
                fillColor: '#eef2f7',
                margin: [8, 6, 8, 6],
                stack: [
                  {
                    columns: [
                      { text: 'DO ZAPŁATY', style: 'label', fontSize: 9 },
                      { text: `${formatMoney(inv.grossTotal)} PLN`, alignment: 'right', fontSize: 14, bold: true, color: ACCENT },
                    ],
                  },
                  { text: `Słownie: ${inv.amountInWords}`, margin: [0, 2, 0, 0], color: MUTED },
                ],
              },
            ],
          ],
        },
        layout: 'noBorders',
      },
      inv.notes ? { text: [{ text: 'Uwagi: ', bold: true }, inv.notes], margin: [0, 12, 0, 0] } : '',
      this.signatures('Osoba upoważniona do odbioru', 'Osoba upoważniona do wystawienia'),
    ];
    return this.render(this.base(content, `${title} ${inv.number}`));
  }

  // ─── WZ ───────────────────────────────────────────────────────────────────

  async goodsIssue(issue: any): Promise<Buffer> {
    const company = await this.settings.get();
    const rows = issue.lines.map((l: any, i: number) => {
      const unitCost = issue.status === 'DRAFT' ? l.product.avgCost : l.unitCost;
      const allocations = (l.allocations ?? [])
        .map((a: any) => `${a.locationCode}${a.handlingUnitCode ? ` / ${a.handlingUnitCode}` : ''}${a.batch ? ` / partia ${a.batch}` : ''}: ${a.quantity}`)
        .join('; ');
      return [
        i + 1,
        l.product.sku,
        { stack: [l.product.name, allocations ? { text: allocations, style: 'small' } : ''] },
        l.quantity,
        UNIT[l.product.unit] ?? l.product.unit,
        formatMoney(unitCost),
        formatMoney(unitCost * l.quantity),
      ];
    });
    const content: Content[] = [
      this.header(
        issue.status === 'CANCELLED' ? 'WZ (ANULOWANY)' : issue.status === 'DRAFT' ? 'WZ (SZKIC)' : 'Wydanie zewnętrzne',
        issue.number,
        [
          ['Data wydania', formatDatePl(issue.issueDate)],
          ['Wystawił', issue.createdBy?.name ?? '—'],
          ...(issue.invoice ? ([['Faktura', issue.invoice.number]] as [string, string][]) : []),
        ],
      ),
      { columns: [this.party('Wydający', company), this.party('Odbiorca', issue.customer)], margin: [0, 0, 0, 20] },
      this.table(
        ['Lp.', 'Indeks', 'Nazwa / miejsce pobrania', 'Ilość', 'J.m.', 'Cena ewid.', 'Wartość'],
        [18, 70, '*', 40, 30, 60, 65],
        [
          ...rows,
          [
            '', '', { text: 'Razem', bold: true },
            { text: String(issue.totals.quantity), bold: true, alignment: 'right' }, '', '',
            { text: formatMoney(issue.totals.cost), bold: true, alignment: 'right' },
          ],
        ],
        [0, 3, 5, 6],
      ),
      { text: 'Wartość w cenach ewidencyjnych (średni ważony koszt zakupu).', style: 'small', margin: [0, 6, 0, 0] },
      issue.notes ? { text: [{ text: 'Uwagi: ', bold: true }, issue.notes], margin: [0, 12, 0, 0] } : '',
      this.signatures('Wydał', 'Odebrał (data, podpis)'),
    ];
    return this.render(this.base(content, `WZ ${issue.number}`));
  }

  // ─── PZ ───────────────────────────────────────────────────────────────────

  async goodsReceipt(receipt: any): Promise<Buffer> {
    const company = await this.settings.get();
    const rows = receipt.lines.map((l: any, i: number) => [
      i + 1,
      l.product.sku,
      { stack: [l.product.name, l.batch ? { text: `partia ${l.batch}${l.expiryDate ? `, ważne do ${formatDatePl(l.expiryDate)}` : ''}`, style: 'small' } : ''] },
      l.expectedQty,
      l.receivedQty,
      { text: l.difference > 0 ? `+${l.difference}` : String(l.difference), alignment: 'right', color: l.difference === 0 ? undefined : '#b91c1c' },
      formatMoney(l.unitPrice),
      formatMoney(l.value),
    ]);
    const pallets = receipt.handlingUnits.length
      ? [
          { text: 'JEDNOSTKI LOGISTYCZNE', style: 'label', margin: [0, 16, 0, 4] } as Content,
          {
            text: receipt.handlingUnits
              .map((h: any) => `${h.type === 'PALLET' ? 'Paleta' : 'Karton'} ${h.code}${h._count.children ? ` (${h._count.children} kart.)` : ''} → ${h.location?.code ?? '—'}`)
              .join('\n'),
            style: 'small',
          } as Content,
        ]
      : [];
    const content: Content[] = [
      this.header(receipt.status === 'COMPLETED' ? 'Przyjęcie zewnętrzne' : `PZ (${receipt.status === 'CANCELLED' ? 'ANULOWANE' : 'W TRAKCIE'})`, receipt.number, [
        ['Data przyjęcia', formatDatePl(receipt.completedAt ?? receipt.createdAt)],
        ['Dokument dostawcy', receipt.supplierDocNo ?? '—'],
        ['Przyjął', receipt.createdBy?.name ?? '—'],
      ]),
      { columns: [this.party('Dostawca', receipt.supplier), this.party('Odbiorca', company)], margin: [0, 0, 0, 20] },
      this.table(
        ['Lp.', 'Indeks', 'Nazwa', 'Awizo', 'Przyjęto', 'Różnica', 'Cena netto', 'Wartość'],
        [18, 62, '*', 36, 40, 38, 52, 60],
        [
          ...rows,
          [
            '', '', { text: 'Razem', bold: true },
            { text: String(receipt.totals.expectedQty), bold: true, alignment: 'right' },
            { text: String(receipt.totals.receivedQty), bold: true, alignment: 'right' },
            '', '',
            { text: formatMoney(receipt.totals.receivedValue), bold: true, alignment: 'right' },
          ],
        ],
        [0, 3, 4, 6, 7],
      ),
      ...pallets,
      receipt.notes ? { text: [{ text: 'Uwagi: ', bold: true }, receipt.notes], margin: [0, 12, 0, 0] } : '',
      this.signatures('Dostarczył', 'Przyjął'),
    ];
    return this.render(this.base(content, `PZ ${receipt.number}`));
  }

  // ─── Etykiety palet (A6) ──────────────────────────────────────────────────

  async palletLabel(units: any | any[]): Promise<Buffer> {
    const list = Array.isArray(units) ? units : [units];
    const pages: Content[] = [];
    for (const [idx, hu] of list.entries()) {
      const barcode = await bwipjs.toBuffer({
        bcid: 'gs1-128',
        text: `(00)${hu.code}`,
        scale: 3,
        height: 18,
        includetext: false,
      });
      const lines = hu.summary.slice(0, 8).map((s: any) => [
        { text: s.product.sku, bold: true },
        s.product.name,
        { text: `${s.quantity} ${UNIT[s.product.unit] ?? ''}`, alignment: 'right', bold: true },
      ]);
      pages.push({
        stack: [
          {
            columns: [
              { text: hu.type === 'PALLET' ? (hu.cartonCount ? 'PALETA MATCZYNA' : 'PALETA') : 'KARTON', fontSize: 16, bold: true, color: ACCENT },
              { text: hu.location?.code ?? '', alignment: 'right', fontSize: 14, bold: true },
            ],
          },
          { text: `SSCC ${hu.code}`, fontSize: 11, margin: [0, 2, 0, 6] },
          { image: `data:image/png;base64,${barcode.toString('base64')}`, width: 300, alignment: 'center' },
          { text: `(00) ${hu.code}`, alignment: 'center', fontSize: 10, margin: [0, 2, 0, 8] },
          {
            columns: [
              { stack: [{ text: 'ILOŚĆ ŁĄCZNA', style: 'label' }, { text: `${hu.totalQty}`, fontSize: 22, bold: true }] },
              { stack: [{ text: 'KARTONY', style: 'label' }, { text: `${hu.cartonCount ?? 0}`, fontSize: 22, bold: true }] },
              { stack: [{ text: 'PRODUKTY', style: 'label' }, { text: `${hu.summary.length}`, fontSize: 22, bold: true }] },
            ],
            margin: [0, 0, 0, 8],
          },
          lines.length
            ? { table: { widths: [70, '*', 60], body: lines }, layout: 'lightHorizontalLines', fontSize: 8 }
            : { text: 'Jednostka pusta', italics: true, color: MUTED },
          hu.summary.length > 8 ? { text: `+ ${hu.summary.length - 8} kolejnych pozycji`, style: 'small' } : '',
          {
            margin: [0, 8, 0, 0],
            style: 'small',
            text: [
              hu.receipt ? `Przyjęcie: ${hu.receipt.number}${hu.receipt.supplier ? ` · ${hu.receipt.supplier.name}` : ''}\n` : '',
              hu.parent ? `Paleta matczyna: ${hu.parent.code}\n` : '',
              `Utworzono: ${formatDatePl(hu.createdAt)}`,
            ],
          },
        ],
        ...(idx < list.length - 1 ? { pageBreak: 'after' as const } : {}),
      });
    }
    const doc = this.base(pages, 'Etykieta logistyczna', 'A6');
    doc.pageMargins = [16, 16, 16, 16];
    delete doc.footer;
    return this.render(doc);
  }
}
