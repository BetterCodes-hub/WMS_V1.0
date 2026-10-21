import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Layers, Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '@/api/client';
import type { HandlingUnitListItem, HuType, Location, Paginated } from '@/api/types';
import { HuCode } from '@/components/HuCode';
import { PageHeader } from '@/components/PageHeader';
import { LocationPicker } from '@/components/Pickers';
import { SearchInput } from '@/components/SearchInput';
import { LocationTypeBadge } from '@/components/StatusBadge';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Checkbox, Field, Select } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { DataTable, Pagination } from '@/components/ui/Table';
import { Segmented } from '@/components/ui/Tabs';
import { useDebounce } from '@/hooks/useDebounce';
import { useMutate } from '@/hooks/useMutate';
import { useAuth } from '@/lib/auth';
import { date, num } from '@/lib/format';

export default function PalletsPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [type, setType] = useState<HuType | ''>('');
  const [rootOnly, setRootOnly] = useState(true);
  const [status, setStatus] = useState<'ACTIVE' | 'EMPTY'>('ACTIVE');
  const [page, setPage] = useState(1);
  const [create, setCreate] = useState(false);
  const q = useDebounce(search);
  const { data, isLoading } = useQuery({
    queryKey: ['handling-units', q, type, rootOnly, status, page],
    queryFn: () => api.get<Paginated<HandlingUnitListItem>>('/handling-units', { search: q, type, rootOnly, status, page, pageSize: 25 }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title="Palety i kartony"
        description="Jednostki logistyczne z numerami SSCC — palety matczyne, kartony i ich zawartość"
        actions={can('MANAGER', 'OPERATOR') && <Button icon={<Plus className="size-4" />} onClick={() => setCreate(true)}>Nowa paleta</Button>}
      />
      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="SSCC, lokalizacja, SKU…" />
          <Select value={type} onChange={(e) => { setType(e.target.value as HuType); setPage(1); }} className="w-auto">
            <option value="">Palety i kartony</option>
            <option value="PALLET">Tylko palety</option>
            <option value="CARTON">Tylko kartony</option>
          </Select>
          <Checkbox label="Tylko najwyższy poziom" checked={rootOnly} onChange={(v) => { setRootOnly(v); setPage(1); }} />
          <div className="ml-auto">
            <Segmented value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[{ value: 'ACTIVE', label: 'Aktywne' }, { value: 'EMPTY', label: 'Puste' }]} />
          </div>
        </div>
        <DataTable
          loading={isLoading}
          rows={data?.items}
          rowKey={(h) => h.id}
          onRowClick={(h) => navigate(`/pallets/${h.id}`)}
          empty={<EmptyState icon={<Layers className="size-6" />} title="Brak jednostek" description="Palety powstają automatycznie podczas przyjęcia towaru." />}
          columns={[
            { key: 'code', header: 'SSCC', cell: (h) => <HuCode code={h.code} type={h.type} full /> },
            {
              key: 'type',
              header: 'Typ',
              cell: (h) =>
                h.type === 'PALLET' ? (h.childCount ? <Badge tone="indigo">Paleta matczyna · {h.childCount}</Badge> : <Badge>Paleta</Badge>) : <Badge tone="violet">Karton</Badge>,
            },
            {
              key: 'loc',
              header: 'Lokalizacja',
              cell: (h) => (h.location ? <span className="inline-flex items-center gap-2"><span className="font-mono text-xs font-medium">{h.location.code}</span><LocationTypeBadge type={h.location.type} /></span> : '—'),
            },
            {
              key: 'content',
              header: 'Zawartość',
              cell: (h) => (
                <div className="max-w-80 text-xs">
                  {h.products.slice(0, 2).map((p) => (
                    <p key={p.id} className="truncate"><span className="font-mono text-slate-500">{p.sku}</span> × {num(p.quantity)}</p>
                  ))}
                  {h.products.length > 2 && <p className="text-slate-400">+ {h.products.length - 2} kolejne</p>}
                </div>
              ),
            },
            { key: 'qty', header: 'Szt.', align: 'right', cell: (h) => <span className="font-semibold tabular">{num(h.totalQty)}</span> },
            { key: 'parent', header: 'Paleta nadrz.', hideOnMobile: true, cell: (h) => (h.parent ? <span className="font-mono text-xs">…{h.parent.code.slice(-8)}</span> : '') },
            { key: 'receipt', header: 'Przyjęcie', hideOnMobile: true, cell: (h) => <span className="text-xs">{h.receipt?.number ?? '—'}<br /><span className="text-slate-400">{date(h.createdAt)}</span></span> },
          ]}
        />
        {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
      </Card>
      <CreatePalletModal open={create} onClose={() => setCreate(false)} />
    </>
  );
}

function CreatePalletModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [type, setType] = useState<HuType>('PALLET');
  const [location, setLocation] = useState<Location | null>(null);
  const save = useMutate(() => api.post<{ id: string }>('/handling-units', { type, locationId: location!.id }), {
    invalidate: [['handling-units']],
    success: 'Utworzono jednostkę',
    onSuccess: (r) => navigate(`/pallets/${r.id}`),
  });
  return (
    <Modal open={open} onClose={onClose} title="Nowa jednostka logistyczna" description="Pusta paleta do kompletacji mieszanej lub przepakowania." size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Anuluj</Button><Button onClick={() => save.mutate()} disabled={!location} loading={save.isPending}>Utwórz</Button></>}>
      <div className="space-y-4">
        <Segmented value={type} onChange={setType} options={[{ value: 'PALLET', label: 'Paleta' }, { value: 'CARTON', label: 'Karton' }]} />
        <Field label="Lokalizacja"><LocationPicker value={location} onChange={setLocation} /></Field>
      </div>
    </Modal>
  );
}
