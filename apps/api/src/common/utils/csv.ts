/** CSV w formacie przyjaznym dla polskiego Excela: separator ";", BOM UTF-8. */
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const escape = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers, ...rows].map((r) => r.map(escape).join(';'));
  return '﻿' + lines.join('\r\n');
}

/** 123456 -> "1234,56" (bez separatora tysięcy — do importu w arkuszu) */
export function csvMoney(grosze: number): string {
  return (grosze / 100).toFixed(2).replace('.', ',');
}
