import type { ProductUnit } from '@/api/types';

const moneyFmt = new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const intFmt = new Intl.NumberFormat('pl-PL');

/** grosze -> "1 234,56" */
export const money = (grosze: number | null | undefined) => moneyFmt.format((grosze ?? 0) / 100);
export const pln = (grosze: number | null | undefined) => `${money(grosze)} zł`;
export const num = (n: number | null | undefined) => intFmt.format(n ?? 0);

/** "12,50" / "12.5" -> 1250 */
export const toGrosze = (value: string | number) => Math.round(Number(String(value).replace(/\s/g, '').replace(',', '.')) * 100);
export const fromGrosze = (grosze: number) => (grosze / 100).toFixed(2).replace('.', ',');

export const date = (d: string | Date | null | undefined) => (d ? new Date(d).toLocaleDateString('pl-PL') : '—');
export const dateTime = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' }) : '—';
export const isoDate = (d: Date = new Date()) => {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
};

export function relative(d: string | Date) {
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  if (diff < 60) return 'przed chwilą';
  if (diff < 3600) return `${Math.floor(diff / 60)} min temu`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)} godz. temu`;
  const days = Math.floor(diff / 86_400);
  return days === 1 ? 'wczoraj' : `${days} dni temu`;
}

export const UNIT: Record<ProductUnit, string> = { PCS: 'szt.', PACK: 'opak.', ROLL: 'rol.', SET: 'kpl.', KG: 'kg' };
export const qty = (n: number, unit?: ProductUnit) => `${num(n)}${unit ? ` ${UNIT[unit]}` : ''}`;

export const daysUntil = (d: string | Date) => Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000);
