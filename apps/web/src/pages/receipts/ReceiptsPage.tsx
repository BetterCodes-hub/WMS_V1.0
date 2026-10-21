import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { PackageCheck, Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '@/api/client';
import type { Paginated, ReceiptListItem, ReceiptStatus } from '@/api/types';
import { PageHeader } from '@/components/PageHeader';
import { SearchInput } from '@/components/SearchInput';
import { ReceiptStatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, Progress } from '@/components/ui/Feedback';
import { DataTable, Pagination } from '@/components/ui/Table';
import { Tabs } from '@/components/ui/Tabs';
import { useDebounce } from '@/hooks/useDebounce';
import { useAuth } from '@/lib/auth';
import { date, money, num } from '@/lib/format';

export default function ReceiptsPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [status, setStatus] = useState<ReceiptStatus | ''>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounce(search);
  const { data, isLoading } = useQuery({
    queryKey: ['receipts', status, q, page],
    queryFn: () => api.get<Paginated<ReceiptListItem>>('/receipts', { status, search: q, page, pageSize: 25 }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title="Przyjęcia towaru (PZ)"
        description="Awizacje dostaw, rozładunek na sztuki i palety, kontrola zgodności z dokumentem dostawcy"
        actions={can('MANAGER', 'OPERATOR') && <Button icon={<Plus className="size-4" />} onClick={() => navigate('/receipts/new')}>Nowe przyjęcie</Button>}
      />
      <Card padded={false}>
        <div className="flex flex-wrap items-end justify-between gap-3 px-4 pt-2">
          <Tabs
            value={status}
            onChange={(v) => { setStatus(v); setPage(1); }}
            tabs={[
              { value: '', label: 'Wszystkie' },
              { value: 'DRAFT', label: 'Awizacje' },
              { value: 'RECEIVING', label: 'W trakcie' },
              { value: 'COMPLETED', label: 'Zakończone' },
              { value: 'CANCELLED', label: 'Anulowane' },
            ]}
          />
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Numer, dostawca, dokument…" className="mb-2" />
        </div>
        <DataTable
          loading={isLoading}
          rows={data?.items}
          rowKey={(r) => r.id}
          onRowClick={(r) => navigate(`/receipts/${r.id}`)}
          empty={<EmptyState icon={<PackageCheck className="size-6" />} title="Brak przyjęć" description="Utwórz awizację dostawy, aby rozpocząć przyjęcie." />}
          columns={[
            { key: 'number', header: 'Numer', cell: (r) => <span className="font-medium whitespace-nowrap">{r.number}</span> },
            { key: 'supplier', header: 'Dostawca', cell: (r) => <div><p>{r.supplier.name}</p>{r.supplierDocNo && <p className="text-xs text-slate-500">dok. {r.supplierDocNo}</p>}</div> },
            { key: 'date', header: 'Data', hideOnMobile: true, cell: (r) => <span className="text-xs text-slate-600">{date(r.completedAt ?? r.expectedDate ?? r.createdAt)}</span> },
            {
              key: 'progress',
              header: 'Postęp',
              cell: (r) => (
                <div className="w-36">
                  <Progress value={r.progress} tone={r.progress > 100 ? 'amber' : r.progress === 100 ? 'green' : 'brand'} />
                  <p className="mt-1 text-xs text-slate-500 tabular">{num(r.receivedQty)} / {num(r.expectedQty)} · {r.lineCount} poz.</p>
                </div>
              ),
            },
            { key: 'pallets', header: 'Jedn.', align: 'right', hideOnMobile: true, cell: (r) => r.palletCount || '—' },
            { key: 'value', header: 'Wartość netto', align: 'right', hideOnMobile: true, cell: (r) => <span className="tabular">{money(r.receivedValue)}</span> },
            { key: 'invoice', header: 'Faktura', hideOnMobile: true, cell: (r) => (r.purchaseInvoice ? <span className="text-xs">{r.purchaseInvoice.number}</span> : r.status === 'COMPLETED' ? <span className="text-xs text-amber-600">do rozliczenia</span> : '') },
            { key: 'status', header: 'Status', cell: (r) => <ReceiptStatusBadge status={r.status} /> },
          ]}
        />
        {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
      </Card>
    </>
  );
}
