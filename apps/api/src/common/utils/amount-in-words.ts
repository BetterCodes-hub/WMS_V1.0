const UNITS = ['', 'jeden', 'dwa', 'trzy', 'cztery', 'pięć', 'sześć', 'siedem', 'osiem', 'dziewięć'];
const TEENS = [
  'dziesięć', 'jedenaście', 'dwanaście', 'trzynaście', 'czternaście',
  'piętnaście', 'szesnaście', 'siedemnaście', 'osiemnaście', 'dziewiętnaście',
];
const TENS = [
  '', '', 'dwadzieścia', 'trzydzieści', 'czterdzieści',
  'pięćdziesiąt', 'sześćdziesiąt', 'siedemdziesiąt', 'osiemdziesiąt', 'dziewięćdziesiąt',
];
const HUNDREDS = [
  '', 'sto', 'dwieście', 'trzysta', 'czterysta',
  'pięćset', 'sześćset', 'siedemset', 'osiemset', 'dziewięćset',
];
const GROUPS: [string, string, string][] = [
  ['', '', ''],
  ['tysiąc', 'tysiące', 'tysięcy'],
  ['milion', 'miliony', 'milionów'],
  ['miliard', 'miliardy', 'miliardów'],
];

/** Odmiana rzeczownika po liczebniku: 1 złoty, 2 złote, 5 złotych. */
export function plural(n: number, forms: [string, string, string]): string {
  if (n === 1) return forms[0];
  const lastTwo = n % 100;
  const last = n % 10;
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return forms[1];
  return forms[2];
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const u = n % 10;
  const parts = [HUNDREDS[h]];
  if (t === 1) parts.push(TEENS[u]);
  else parts.push(TENS[t], UNITS[u]);
  return parts.filter(Boolean).join(' ');
}

export function numberToWords(n: number): string {
  if (n === 0) return 'zero';
  const parts: string[] = [];
  let group = 0;
  while (n > 0) {
    const chunk = n % 1000;
    if (chunk > 0) {
      let words = threeDigits(chunk);
      if (group > 0) {
        // "tysiąc" zamiast "jeden tysiąc"
        words = chunk === 1 ? GROUPS[group][0] : `${words} ${plural(chunk, GROUPS[group])}`;
      }
      parts.unshift(words);
    }
    n = Math.floor(n / 1000);
    group++;
  }
  return parts.join(' ');
}

/** 123456 gr -> "jeden tysiąc dwieście trzydzieści cztery złote 56/100" */
export function amountInWords(grosze: number): string {
  const zl = Math.floor(Math.abs(grosze) / 100);
  const gr = Math.abs(grosze) % 100;
  const prefix = grosze < 0 ? 'minus ' : '';
  return `${prefix}${numberToWords(zl)} ${plural(zl, ['złoty', 'złote', 'złotych'])} ${gr
    .toString()
    .padStart(2, '0')}/100`;
}
