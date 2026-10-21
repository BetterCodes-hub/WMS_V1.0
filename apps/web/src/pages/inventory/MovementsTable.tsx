import { ArrowRight } from 'lucide-react';
import type { Movement, MovementType } from '@/api/types';
import { Badge, Tone } from '@/components/ui/Badge';
import { DataTable } from '@/components/ui/Table';
import { dateTime, num } from '@/lib/format';
import { MOVEMENT } from '@/lib/labels';

const TONE: Record<MovementType, Tone> = {
  RECEIPT: 'green', PUTAWAY: 'blue', TRANSFER: 'gray', REPLENISHMENT: 'indigo', ISSUE: 'amber',
  ADJUSTMENT_PLUS: 'green', ADJUSTMENT_MINUS: 'red', CONSUMPTION: 'violet',
};
const SIGN: Partial<Record<MovementType, string>> = { RECEIPT: '+', ADJUSTMENT_PLUS: '+', ISSUE: '−', ADJUSTMENT_MINUS: '−', CONSUMPTION: '−' };

export function MovementsTable({ rows, loading, compact }: { rows?: Movement[]; loading?: boolean; compact?: boolean }) {
  return (
    <DataTable
      loading={loading}
      rows={rows}
      rowKey={(m) => m.id}
      empty="Brak ruchów"
      columns={[
        { key: 'date', header: 'Data', cell: (m) => <span className="text-xs whitespace-nowrap text-slate-500">{dateTime(m.createdAt)}</span> },
        { key: 'type', header: 'Operacja', cell: (m) => <Badge tone={TONE[m.type]}>{MOVEMENT[m.type]}</Badge> },
        ...(compact
          ? []
          : [{
              key: 'product',
              header: 'Produkt',
              cell: (m: Movement) => (
                <div>
                  <span className="font-mono text-xs text-slate-500">{m.product.sku}</span>
                  <p className="max-w-64 truncate text-sm">{m.product.name}</p>
                </div>
              ),
            }]),
        {
          key: 'route',
          header: 'Skąd → dokąd',
          cell: (m) => (
            <span className="inline-flex items-center gap-1.5 font-mono text-xs whitespace-nowrap">
              {m.fromLocation?.code ?? <span className="text-slate-300">—</span>}
              <ArrowRight className="size-3 text-slate-400" />
              {m.toLocation?.code ?? <span className="text-slate-300">—</span>}
            </span>
          ),
        },
        { key: 'hu', header: 'Jednostka', hideOnMobile: true, cell: (m) => (m.handlingUnit ? <span className="font-mono text-xs">…{m.handlingUnit.code.slice(-8)}</span> : '') },
        {
          key: 'doc',
          header: 'Dokument / powód',
          hideOnMobile: true,
          cell: (m) => (
            <div className="text-xs">
              {m.documentNo && <p className="font-medium">{m.documentNo}</p>}
              {m.reason && <p className="text-slate-500">{m.reason}</p>}
              {m.batch && <p className="text-slate-500">partia {m.batch}</p>}
            </div>
          ),
        },
        { key: 'user', header: 'Użytkownik', hideOnMobile: true, cell: (m) => <span className="text-xs text-slate-600">{m.user.name}</span> },
        {
          key: 'qty',
          header: 'Ilość',
          align: 'right',
          cell: (m) => (
            <span className={`font-medium tabular ${SIGN[m.type] === '+' ? 'text-emerald-600' : SIGN[m.type] === '−' ? 'text-red-600' : ''}`}>
              {SIGN[m.type] ?? ''}
              {num(m.quantity)}
            </span>
          ),
        },
      ]}
    />
  );
}
