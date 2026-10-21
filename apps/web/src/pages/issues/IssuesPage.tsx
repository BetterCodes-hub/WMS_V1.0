import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus, Truck } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '@/api/client';
import type { IssueListItem, IssueStatus, Paginated } from '@/api/types';
import { PageHeader } from '@/components/PageHeader';
import { SearchInput } from '@/components/SearchInput';
import { IssueStatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/Feedback';
import { DataTable, Pagination } from '@/components/ui/Table';
import { Tabs } from '@/components/ui/Tabs';
import { useDebounce } from '@/hooks/useDebounce';
import { useAuth } from '@/lib/auth';
import { date, money, num } from '@/lib/format';

export default function IssuesPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [status, setStatus] = useState<IssueStatus | '' | 'UNINVOICED'>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounce(search);
  const { data, isLoading } = useQuery({
    queryKey: ['issues', status, q, page],
    queryFn: () =>
      api.get<Paginated<IssueListItem>>('/issues', {
        status: status === 'UNINVOICED' ? undefined : status,
        uninvoiced: status === 'UNINVOICED' || undefined,
        search: q,
        page,
        pageSize: 25,
      }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title="Wydania zewnętrzne (WZ)"
        description="Kompletacja i wydanie towaru do odbiorców — pobranie wg FEFO, wycena po średnim koszcie"
        actions={can('MANAGER', 'OPERATOR') && <Button icon={<Plus className="size-4" />} onClick={() => navigate('/issues/new')}>Nowe wydanie</Button>}
      />
      <Card padded={false}>
        <div className="flex flex-wrap items-end justify-between gap-3 px-4 pt-2">
          <Tabs
            value={status}
            onChange={(v) => { setStatus(v); setPage(1); }}
            tabs={[
              { value: '', label: 'Wszystkie' },
              { value: 'DRAFT', label: 'Szkice' },
              { value: 'CONFIRMED', label: 'Wydane' },
              { value: 'UNINVOICED', label: 'Do zafakturowania' },
              { value: 'CANCELLED', label: 'Anulowane' },
            ]}
          />
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Numer lub odbiorca…" className="mb-2" />
        </div>
        <DataTable
          loading={isLoading}
          rows={data?.items}
          rowKey={(i) => i.id}
          onRowClick={(i) => navigate(`/issues/${i.id}`)}
          empty={<EmptyState icon={<Truck className="size-6" />} title="Brak dokumentów WZ" />}
          columns={[
            { key: 'number', header: 'Numer', cell: (i) => <span className="font-medium whitespace-nowrap">{i.number}</span> },
            { key: 'customer', header: 'Odbiorca', cell: (i) => i.customer.name },
            { key: 'date', header: 'Data', cell: (i) => <span className="text-xs text-slate-600">{date(i.issueDate)}</span> },
            { key: 'lines', header: 'Poz. / ilość', align: 'right', hideOnMobile: true, cell: (i) => <span className="tabular">{i.lineCount} / {num(i.totalQty)}</span> },
            { key: 'net', header: 'Wartość netto', align: 'right', cell: (i) => <span className="tabular">{money(i.netValue)}</span> },
            { key: 'cost', header: 'Koszt (ewid.)', align: 'right', hideOnMobile: true, cell: (i) => (i.status === 'CONFIRMED' ? <span className="text-slate-500 tabular">{money(i.costValue)}</span> : '—') },
            { key: 'invoice', header: 'Faktura', hideOnMobile: true, cell: (i) => (i.invoice ? <span className="text-xs">{i.invoice.number}</span> : i.status === 'CONFIRMED' ? <span className="text-xs text-amber-600">niezafakturowane</span> : '') },
            { key: 'status', header: 'Status', cell: (i) => <IssueStatusBadge status={i.status} /> },
          ]}
        />
        {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
      </Card>
    </>
  );
}
