import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { FileText, Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '@/api/client';
import type { Invoice, InvoiceStatus, InvoiceType, Paginated } from '@/api/types';
import { PageHeader } from '@/components/PageHeader';
import { SearchInput } from '@/components/SearchInput';
import { InvoiceStatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Checkbox, Input, Select } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/Feedback';
import { DataTable, Pagination } from '@/components/ui/Table';
import { Tabs } from '@/components/ui/Tabs';
import { useDebounce } from '@/hooks/useDebounce';
import { date, money } from '@/lib/format';

export default function InvoicesPage() {
  const navigate = useNavigate();
  const [type, setType] = useState<InvoiceType>('SALES');
  const [status, setStatus] = useState<InvoiceStatus | ''>('');
  const [overdue, setOverdue] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounce(search);
  const { data, isLoading } = useQuery({
    queryKey: ['invoices', type, status, overdue, from, to, q, page],
    queryFn: () => api.get<Paginated<Invoice> & { sums: { net: number; vat: number; gross: number } }>('/invoices', { type, status, overdue, from, to, search: q, page, pageSize: 25 }),
    placeholderData: keepPreviousData,
  });
  const reset = () => setPage(1);

  return (
    <>
      <PageHeader
        title="Faktury"
        description="Faktury sprzedaży do dokumentów WZ oraz faktury zakupowe rozliczane z przyjęciami PZ"
        actions={<Button icon={<Plus className="size-4" />} onClick={() => navigate('/invoices/new')}>Wystaw fakturę</Button>}
      />
      <Card padded={false}>
        <Tabs className="px-4" value={type} onChange={(v) => { setType(v); reset(); }} tabs={[{ value: 'SALES', label: 'Sprzedaż' }, { value: 'PURCHASE', label: 'Zakup' }]} />
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <SearchInput value={search} onChange={(v) => { setSearch(v); reset(); }} placeholder="Numer, kontrahent, NIP…" />
          <Select value={status} onChange={(e) => { setStatus(e.target.value as InvoiceStatus); reset(); }} className="w-auto">
            <option value="">Wszystkie statusy</option>
            <option value="ISSUED">Nieopłacone</option>
            <option value="PAID">Opłacone</option>
            <option value="CANCELLED">Anulowane</option>
          </Select>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            od <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); reset(); }} className="w-auto" />
            do <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); reset(); }} className="w-auto" />
          </div>
          <Checkbox label="Po terminie" checked={overdue} onChange={(v) => { setOverdue(v); reset(); }} />
        </div>
        <DataTable
          loading={isLoading}
          rows={data?.items}
          rowKey={(i) => i.id}
          onRowClick={(i) => navigate(`/invoices/${i.id}`)}
          rowClassName={(i) => (i.status === 'CANCELLED' ? 'opacity-50' : undefined)}
          empty={<EmptyState icon={<FileText className="size-6" />} title="Brak faktur" />}
          columns={[
            { key: 'number', header: 'Numer', cell: (i) => <div><p className="font-medium whitespace-nowrap">{i.number}</p>{i.externalNumber && <p className="text-xs text-slate-500">{i.externalNumber}</p>}</div> },
            { key: 'contractor', header: 'Kontrahent', cell: (i) => <div><p>{i.contractor.name}</p>{i.contractor.nip && <p className="text-xs text-slate-500">NIP {i.contractor.nip}</p>}</div> },
            { key: 'date', header: 'Wystawiona', hideOnMobile: true, cell: (i) => <span className="text-xs">{date(i.issueDate)}</span> },
            { key: 'due', header: 'Termin', cell: (i) => <span className={`text-xs ${i.overdue ? 'font-semibold text-red-600' : ''}`}>{date(i.dueDate)}</span> },
            { key: 'net', header: 'Netto', align: 'right', hideOnMobile: true, cell: (i) => <span className="tabular">{money(i.netTotal)}</span> },
            { key: 'vat', header: 'VAT', align: 'right', hideOnMobile: true, cell: (i) => <span className="tabular text-slate-500">{money(i.vatTotal)}</span> },
            { key: 'gross', header: 'Brutto', align: 'right', cell: (i) => <span className="font-medium tabular">{money(i.grossTotal)}</span> },
            { key: 'status', header: 'Status', cell: (i) => <InvoiceStatusBadge status={i.status} overdue={i.overdue} /> },
          ]}
          footer={
            data?.items.length ? (
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 text-sm font-semibold">
                  <td className="px-4 py-2.5" colSpan={2}>Razem (bez anulowanych)</td>
                  <td className="hidden md:table-cell" colSpan={2} />
                  <td className="hidden px-4 py-2.5 text-right tabular md:table-cell">{money(data.sums.net)}</td>
                  <td className="hidden px-4 py-2.5 text-right tabular md:table-cell">{money(data.sums.vat)}</td>
                  <td className="px-4 py-2.5 text-right tabular">{money(data.sums.gross)}</td>
                  <td />
                </tr>
              </tfoot>
            ) : undefined
          }
        />
        {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
      </Card>
    </>
  );
}
