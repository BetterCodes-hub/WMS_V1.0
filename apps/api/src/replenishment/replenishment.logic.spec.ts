import { computeReplenishment, ReserveStock } from './replenishment.logic';

const reserve = (id: string, quantity: number, expiry: string | null, received = '2026-01-01'): ReserveStock => ({
  id,
  quantity,
  expiryDate: expiry ? new Date(expiry) : null,
  receivedAt: new Date(received),
  locationId: `loc-${id}`,
  locationCode: `R-${id}`,
  handlingUnitId: null,
  handlingUnitCode: null,
  batch: null,
});

describe('computeReplenishment', () => {
  it('nie uzupełnia powyżej minimum', () => {
    const r = computeReplenishment({ current: 30, pending: 0, minQty: 20, maxQty: 100, reserve: [reserve('a', 500, null)] });
    expect(r.status).toBe('OK');
    expect(r.needed).toBe(0);
    expect(r.suggestions).toHaveLength(0);
  });

  it('uzupełnia do maksimum z najkrótszą datą ważności', () => {
    const r = computeReplenishment({
      current: 10,
      pending: 0,
      minQty: 20,
      maxQty: 100,
      reserve: [reserve('late', 80, '2027-06-01'), reserve('early', 50, '2026-12-01')],
    });
    expect(r.status).toBe('REQUIRED');
    expect(r.needed).toBe(90);
    expect(r.suggestions.map((s) => [s.fromLocationCode, s.quantity])).toEqual([
      ['R-early', 50],
      ['R-late', 40],
    ]);
    expect(r.priority).toBe('HIGH');
  });

  it('uwzględnia otwarte zadania', () => {
    const r = computeReplenishment({ current: 0, pending: 100, minQty: 20, maxQty: 100, reserve: [reserve('a', 500, null)] });
    expect(r.status).toBe('IN_PROGRESS');
    expect(r.priority).toBe('URGENT');
  });

  it('sygnalizuje brak towaru w rezerwie', () => {
    const r = computeReplenishment({ current: 5, pending: 0, minQty: 20, maxQty: 100, reserve: [] });
    expect(r.status).toBe('NO_RESERVE');
    expect(r.needed).toBe(95);
  });

  it('scala źródła z tej samej lokalizacji w jedno zadanie', () => {
    const a = { ...reserve('a', 10, null), locationId: 'X', locationCode: 'R-X', handlingUnitId: 'c1' };
    const b = { ...reserve('b', 20, null, '2026-02-01'), locationId: 'X', locationCode: 'R-X', handlingUnitId: 'c2' };
    const r = computeReplenishment({ current: 0, pending: 0, minQty: 5, maxQty: 25, reserve: [a, b] });
    expect(r.suggestions).toEqual([expect.objectContaining({ fromLocationCode: 'R-X', quantity: 25, handlingUnitId: null })]);
  });

  it('proponuje częściowe uzupełnienie gdy rezerwa nie wystarcza', () => {
    const r = computeReplenishment({ current: 5, pending: 0, minQty: 20, maxQty: 100, reserve: [reserve('a', 30, null)] });
    expect(r.suggestions).toEqual([expect.objectContaining({ quantity: 30 })]);
  });
});
