export interface StockKeyParts {
  productId: string;
  locationId: string;
  handlingUnitId?: string | null;
  batch?: string | null;
  expiryDate?: Date | null;
}

/** Deterministyczny klucz rekordu stanu — umożliwia atomowy upsert. */
export function stockKey(p: StockKeyParts): string {
  const expiry = p.expiryDate ? p.expiryDate.toISOString().slice(0, 10) : '';
  return [p.productId, p.locationId, p.handlingUnitId ?? '', p.batch ?? '', expiry].join('|');
}
