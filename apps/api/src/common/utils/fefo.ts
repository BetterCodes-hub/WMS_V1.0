export interface AllocatableStock {
  id: string;
  quantity: number;
  expiryDate: Date | null;
  receivedAt: Date;
  /** niższy = preferowany (np. lokalizacje kompletacyjne przed rezerwą) */
  priority?: number;
}

export interface Allocation<T> {
  item: T;
  quantity: number;
}

/** Porządek FEFO: priorytet lokalizacji, najkrótsza data ważności, potem FIFO. */
export function fefoCompare(a: AllocatableStock, b: AllocatableStock): number {
  const pa = a.priority ?? 0;
  const pb = b.priority ?? 0;
  if (pa !== pb) return pa - pb;
  const ea = a.expiryDate?.getTime() ?? Number.POSITIVE_INFINITY;
  const eb = b.expiryDate?.getTime() ?? Number.POSITIVE_INFINITY;
  if (ea !== eb) return ea - eb;
  return a.receivedAt.getTime() - b.receivedAt.getTime();
}

/** Zwraca alokacje pokrywające żądaną ilość lub null, jeżeli stanu brakuje. */
export function allocateFefo<T extends AllocatableStock>(items: T[], quantity: number): Allocation<T>[] | null {
  const sorted = [...items].filter((i) => i.quantity > 0).sort(fefoCompare);
  const result: Allocation<T>[] = [];
  let remaining = quantity;
  for (const item of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(item.quantity, remaining);
    result.push({ item, quantity: take });
    remaining -= take;
  }
  return remaining > 0 ? null : result;
}
