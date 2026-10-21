/** Fikcyjny prefiks firmy GS1 (590 = Polska). */
export const GS1_COMPANY_PREFIX = '5901234';

/** Cyfra kontrolna GS1 (mod 10) dla ciągu cyfr bez cyfry kontrolnej. */
export function gs1CheckDigit(digits: string): number {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    const d = Number(digits[digits.length - 1 - i]);
    sum += i % 2 === 0 ? d * 3 : d;
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * Buduje 18-cyfrowy SSCC: cyfra rozszerzenia + prefiks firmy + numer seryjny + cyfra kontrolna.
 * Cyfra rozszerzenia: 3 = paleta, 1 = karton.
 */
export function buildSscc(extension: number, serial: number): string {
  const serialLength = 17 - 1 - GS1_COMPANY_PREFIX.length;
  const body = `${extension}${GS1_COMPANY_PREFIX}${serial.toString().padStart(serialLength, '0')}`;
  if (body.length !== 17) throw new Error('Przekroczono pulę numerów SSCC');
  return body + gs1CheckDigit(body);
}

export function isValidSscc(code: string): boolean {
  return /^\d{18}$/.test(code) && gs1CheckDigit(code.slice(0, 17)) === Number(code[17]);
}
