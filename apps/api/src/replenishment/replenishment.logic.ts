import { TaskPriority } from '@prisma/client';
import { allocateFefo, fefoCompare } from '../common/utils/fefo';

export type ReplenishmentStatus = 'OK' | 'REQUIRED' | 'IN_PROGRESS' | 'NO_RESERVE';

export interface ReserveStock {
  id: string;
  quantity: number;
  expiryDate: Date | null;
  receivedAt: Date;
  locationId: string;
  locationCode: string;
  handlingUnitId: string | null;
  handlingUnitCode: string | null;
  batch: string | null;
}

export interface Suggestion {
  fromLocationId: string;
  fromLocationCode: string;
  handlingUnitId: string | null;
  handlingUnitCode: string | null;
  batch: string | null;
  expiryDate: Date | null;
  quantity: number;
}

export interface ReplenishmentInput {
  current: number;
  pending: number;
  minQty: number;
  maxQty: number;
  reserve: ReserveStock[];
}

export function priorityFor(current: number, minQty: number): TaskPriority {
  if (current <= 0) return TaskPriority.URGENT;
  if (current <= minQty / 2) return TaskPriority.HIGH;
  return TaskPriority.NORMAL;
}

/**
 * Wylicza potrzebę uzupełnienia miejsca kompletacji:
 * uruchamiane gdy stan <= min, uzupełnia do max (z uwzględnieniem otwartych zadań),
 * źródła wybierane z rezerwy wg FEFO.
 */
export function computeReplenishment(input: ReplenishmentInput) {
  const { current, pending, minQty, maxQty, reserve } = input;
  const reserveQty = reserve.reduce((s, r) => s + r.quantity, 0);
  const triggered = current <= minQty;
  const needed = triggered ? Math.max(0, maxQty - current - pending) : 0;

  let suggestions: Suggestion[] = [];
  if (needed > 0 && reserveQty > 0) {
    const take = Math.min(needed, reserveQty);
    const alloc = allocateFefo(reserve, take) ?? [];
    // jedna sugestia (zadanie) na lokalizację — np. kilka kartonów z tej samej palety matczynej
    const byLocation = new Map<string, Suggestion>();
    for (const { item, quantity } of alloc) {
      const s = byLocation.get(item.locationId);
      if (!s) {
        byLocation.set(item.locationId, {
          fromLocationId: item.locationId,
          fromLocationCode: item.locationCode,
          handlingUnitId: item.handlingUnitId,
          handlingUnitCode: item.handlingUnitCode,
          batch: item.batch,
          expiryDate: item.expiryDate,
          quantity,
        });
        continue;
      }
      s.quantity += quantity;
      if (s.handlingUnitId !== item.handlingUnitId) {
        s.handlingUnitId = null;
        s.handlingUnitCode = null;
      }
      if (s.batch !== item.batch) s.batch = null;
    }
    suggestions = [...byLocation.values()];
  }

  let status: ReplenishmentStatus = 'OK';
  if (triggered) {
    if (needed === 0) status = 'IN_PROGRESS';
    else if (reserveQty === 0) status = 'NO_RESERVE';
    else status = 'REQUIRED';
  }

  return {
    status,
    needed,
    reserveQty,
    suggestions,
    priority: priorityFor(current, minQty),
    fillPercent: maxQty > 0 ? Math.min(100, Math.round((current / maxQty) * 100)) : 0,
  };
}

export { fefoCompare };
