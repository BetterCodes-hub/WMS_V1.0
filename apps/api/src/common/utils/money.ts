/** Kwoty w groszach (Int). */

export interface LineAmounts {
  net: number;
  vat: number;
  gross: number;
}

/** Zaokrąglenie "połówki w górę" (zgodne z praktyką księgową dla kwot dodatnich i ujemnych). */
export function roundHalfUp(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

export function lineAmounts(quantity: number, unitNet: number, vatRate: number): LineAmounts {
  const net = quantity * unitNet;
  const vat = roundHalfUp((net * vatRate) / 100);
  return { net, vat, gross: net + vat };
}

export interface VatBreakdownRow {
  vatRate: number;
  net: number;
  vat: number;
  gross: number;
}

/**
 * Podsumowanie wg stawek VAT. VAT liczony od sumy netto w danej stawce
 * (art. 106e ust. 1 pkt 14 ustawy o VAT) — to on jest wiążący dla sumy faktury.
 */
export function vatBreakdown(lines: { net: number; vatRate: number }[]): VatBreakdownRow[] {
  const byRate = new Map<number, number>();
  for (const l of lines) byRate.set(l.vatRate, (byRate.get(l.vatRate) ?? 0) + l.net);
  return [...byRate.entries()]
    .sort(([a], [b]) => b - a)
    .map(([vatRate, net]) => {
      const vat = roundHalfUp((net * vatRate) / 100);
      return { vatRate, net, vat, gross: net + vat };
    });
}

export function totals(rows: VatBreakdownRow[]) {
  return rows.reduce(
    (acc, r) => ({ net: acc.net + r.net, vat: acc.vat + r.vat, gross: acc.gross + r.gross }),
    { net: 0, vat: 0, gross: 0 },
  );
}

/** 123456 -> "1 234,56" */
export function formatMoney(grosze: number): string {
  const sign = grosze < 0 ? '-' : '';
  const abs = Math.abs(grosze);
  const zl = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const gr = (abs % 100).toString().padStart(2, '0');
  return `${sign}${zl},${gr}`;
}

/** Średni ważony koszt po przyjęciu nowej partii. */
export function weightedAverageCost(
  currentQty: number,
  currentAvg: number,
  addedQty: number,
  addedPrice: number,
): number {
  const base = Math.max(currentQty, 0);
  if (base + addedQty <= 0) return addedPrice;
  return Math.round((base * currentAvg + addedQty * addedPrice) / (base + addedQty));
}
