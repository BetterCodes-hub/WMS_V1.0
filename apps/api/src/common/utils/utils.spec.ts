import { amountInWords, numberToWords, plural } from './amount-in-words';
import { allocateFefo } from './fefo';
import { formatMoney, lineAmounts, vatBreakdown, totals, weightedAverageCost } from './money';
import { buildSscc, isValidSscc, gs1CheckDigit } from './sscc';
import { stockKey } from './stock-key';
import { toCsv } from './csv';

describe('money', () => {
  it('liczy kwoty pozycji', () => {
    expect(lineAmounts(3, 1999, 23)).toEqual({ net: 5997, vat: 1379, gross: 7376 });
    expect(lineAmounts(1, 100, 0)).toEqual({ net: 100, vat: 0, gross: 100 });
  });

  it('podsumowuje VAT od sumy netto w stawce', () => {
    const rows = vatBreakdown([
      { net: 333, vatRate: 23 },
      { net: 333, vatRate: 23 },
      { net: 1000, vatRate: 8 },
    ]);
    expect(rows).toEqual([
      { vatRate: 23, net: 666, vat: 153, gross: 819 },
      { vatRate: 8, net: 1000, vat: 80, gross: 1080 },
    ]);
    expect(totals(rows)).toEqual({ net: 1666, vat: 233, gross: 1899 });
  });

  it('formatuje kwoty po polsku', () => {
    expect(formatMoney(123456789)).toBe('1 234 567,89');
    expect(formatMoney(5)).toBe('0,05');
    expect(formatMoney(-1050)).toBe('-10,50');
  });

  it('liczy średni ważony koszt', () => {
    expect(weightedAverageCost(0, 0, 10, 500)).toBe(500);
    expect(weightedAverageCost(10, 500, 10, 700)).toBe(600);
    expect(weightedAverageCost(-5, 500, 10, 700)).toBe(700);
  });
});

describe('kwota słownie', () => {
  it.each([
    [0, 'zero'],
    [1, 'jeden'],
    [12, 'dwanaście'],
    [215, 'dwieście piętnaście'],
    [1000, 'tysiąc'],
    [2001, 'dwa tysiące jeden'],
    [15000, 'piętnaście tysięcy'],
    [1250000, 'milion dwieście pięćdziesiąt tysięcy'],
    [22000000, 'dwadzieścia dwa miliony'],
  ])('%i -> %s', (n, words) => expect(numberToWords(n)).toBe(words));

  it('odmienia złote', () => {
    expect(plural(1, ['złoty', 'złote', 'złotych'])).toBe('złoty');
    expect(plural(3, ['złoty', 'złote', 'złotych'])).toBe('złote');
    expect(plural(13, ['złoty', 'złote', 'złotych'])).toBe('złotych');
    expect(plural(22, ['złoty', 'złote', 'złotych'])).toBe('złote');
    expect(amountInWords(123405)).toBe('tysiąc dwieście trzydzieści cztery złote 05/100');
  });
});

describe('SSCC', () => {
  it('generuje poprawny numer z cyfrą kontrolną', () => {
    const code = buildSscc(3, 42);
    expect(code).toHaveLength(18);
    expect(code.startsWith('35901234')).toBe(true);
    expect(isValidSscc(code)).toBe(true);
    expect(isValidSscc(code.slice(0, 17) + ((Number(code[17]) + 1) % 10))).toBe(false);
  });

  it('liczy cyfrę kontrolną GS1 (przykład z dokumentacji GS1)', () => {
    expect(gs1CheckDigit('00614141123456789')).toBe(0);
  });
});

describe('FEFO', () => {
  const d = (s: string) => new Date(s);
  const items = [
    { id: 'a', quantity: 5, expiryDate: d('2027-01-01'), receivedAt: d('2026-01-01') },
    { id: 'b', quantity: 5, expiryDate: d('2026-12-01'), receivedAt: d('2026-02-01') },
    { id: 'c', quantity: 5, expiryDate: null, receivedAt: d('2025-01-01') },
    { id: 'pick', quantity: 2, expiryDate: null, receivedAt: d('2026-05-01'), priority: -1 },
  ];

  it('wybiera najpierw priorytet, potem najkrótszą datę ważności', () => {
    const alloc = allocateFefo(items, 9)!;
    expect(alloc.map((a) => [a.item.id, a.quantity])).toEqual([
      ['pick', 2],
      ['b', 5],
      ['a', 2],
    ]);
  });

  it('zwraca null przy braku stanu', () => {
    expect(allocateFefo(items, 100)).toBeNull();
  });
});

describe('stockKey / csv', () => {
  it('buduje stabilny klucz', () => {
    expect(stockKey({ productId: 'p', locationId: 'l', batch: 'B1', expiryDate: new Date('2026-05-01T00:00:00Z') })).toBe(
      'p|l||B1|2026-05-01',
    );
  });

  it('escapuje CSV', () => {
    expect(toCsv(['a', 'b'], [['x;y', 'z"q']])).toBe('﻿a;b\r\n"x;y";"z""q"');
  });
});
