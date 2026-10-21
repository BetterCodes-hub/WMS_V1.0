import { Injectable } from '@nestjs/common';
import { Tx } from '../common/types';
import { buildSscc } from '../common/utils/sscc';

export type DocumentPrefix = 'PZ' | 'WZ' | 'FV' | 'FZ' | 'RPL';

@Injectable()
export class SequenceService {
  /** Atomowo zwiększa licznik (INSERT ... ON CONFLICT) — bezpieczne przy równoległych transakcjach. */
  async next(tx: Tx, prefix: string, year: number, month: number): Promise<number> {
    const rows = await tx.$queryRaw<{ last: number }[]>`
      INSERT INTO "DocumentSequence" ("prefix", "year", "month", "last")
      VALUES (${prefix}, ${year}, ${month}, 1)
      ON CONFLICT ("prefix", "year", "month")
      DO UPDATE SET "last" = "DocumentSequence"."last" + 1
      RETURNING "last"`;
    return rows[0].last;
  }

  /** Numer dokumentu w formacie PREFIX/RRRR/MM/NNNN, numeracja miesięczna. */
  async documentNumber(tx: Tx, prefix: DocumentPrefix, date = new Date()): Promise<string> {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const n = await this.next(tx, prefix, year, month);
    return `${prefix}/${year}/${String(month).padStart(2, '0')}/${String(n).padStart(4, '0')}`;
  }

  async sscc(tx: Tx, kind: 'PALLET' | 'CARTON'): Promise<string> {
    const serial = await this.next(tx, 'SSCC', 0, 0);
    return buildSscc(kind === 'PALLET' ? 3 : 1, serial);
  }
}
