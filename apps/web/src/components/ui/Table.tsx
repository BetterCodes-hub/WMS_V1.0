import { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './Feedback';

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
  /** ukryj na małych ekranach */
  hideOnMobile?: boolean;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  loading,
  empty,
  footer,
  rowClassName,
}: {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  empty?: ReactNode;
  footer?: ReactNode;
  rowClassName?: (row: T) => string | undefined;
}) {
  const align = (a?: string) => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left');
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/80">
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  'px-4 py-2.5 text-xs font-semibold tracking-wide whitespace-nowrap text-slate-500 uppercase',
                  align(c.align),
                  c.hideOnMobile && 'hidden md:table-cell',
                  c.className,
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {loading && !rows ? (
            <tr>
              <td colSpan={columns.length} className="py-16">
                <Spinner />
              </td>
            </tr>
          ) : rows?.length ? (
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(onRowClick && 'cursor-pointer hover:bg-slate-50', 'transition-colors', rowClassName?.(row))}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn('px-4 py-3 align-middle', align(c.align), c.hideOnMobile && 'hidden md:table-cell', c.className)}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length} className="px-4 py-14 text-center text-sm text-slate-500">
                {empty ?? 'Brak danych'}
              </td>
            </tr>
          )}
        </tbody>
        {footer}
      </table>
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return total ? <div className="px-4 py-3 text-xs text-slate-500">Razem: {total}</div> : null;
  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
      <span>
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} z {total}
      </span>
      <div className="flex gap-1">
        <button
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          className="rounded-md border border-slate-200 px-2.5 py-1 hover:bg-slate-50 disabled:opacity-40"
        >
          Poprzednia
        </button>
        <span className="px-2 py-1">
          {page} / {pages}
        </span>
        <button
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
          className="rounded-md border border-slate-200 px-2.5 py-1 hover:bg-slate-50 disabled:opacity-40"
        >
          Następna
        </button>
      </div>
    </div>
  );
}
