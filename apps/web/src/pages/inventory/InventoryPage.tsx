import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRightLeft, CalendarClock, MoreHorizontal, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '@/api/client';
import type { LocationType, Paginated, StockItem } from '@/api/types';
import { HuCode } from '@/components/HuCode';
import { PageHeader } from '@/components/PageHeader';
import { SearchInput } from '@/components/SearchInput';
import { LocationTypeBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/Button';
import { Card, StatCard } from '@/components/ui/Card';
import { Checkbox, Select } from '@/components/ui/Field';
import { DataTable, Pagination } from '@/components/ui/Table';
import { Tabs } from '@/components/ui/Tabs';
import { useDebounce } from '@/hooks/useDebounce';
import { useAuth } from '@/lib/auth';
import { date, daysUntil, money, num, pln, UNIT } from '@/lib/format';
import { LOCATION_TYPE } from '@/lib/labels';
import { AdjustModal, TransferModal } from './StockActions';

interface SummaryRow {
  product: { id: string; sku: string; name: string; unit: StockItem['product']['unit']; category?: string; minStock: number };
  byType: Record<LocationType, number>;
  total: number;
  value: number;
  avgCost: number;
  belowMin: boolean;
}

type Tab = 'products' | 'locations' | 'expiring';

export default function InventoryPage() {
  const [tab, setTab] = useState<Tab>('products');
  const { can } = useAuth();
  const [adjust, setAdjust] = useState(false);
  const { data: value } = useQuery({ queryKey: ['inventory', 'value'], queryFn: () => api.get<{ value: number; quantity: number }>('/inventory/value') });
  const { data: expiring } = useQuery({ queryKey: ['inventory', 'expiring'], queryFn: () => api.get<StockItem[]>('/inventory/expiring') });

  return (
    <>
      <PageHeader
        title="Stany magazynowe"
        description="Aktualne stany wg produktów i lokalizacji, wycena po średnim koszcie zakupu"
        actions={can('MANAGER', 'OPERATOR') && <Button variant="secondary" icon={<SlidersHorizontal className="size-4" />} onClick={() => setAdjust(true)}>Korekta stanu</Button>}
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Wartość magazynu" value={pln(value?.value)} tone="brand" />
        <StatCard label="Jednostek na stanie" value={num(value?.quantity)} />
        <StatCard label="Partie z kończącą się ważnością" value={expiring?.length ?? '—'} tone={expiring?.length ? 'amber' : 'slate'} icon={<CalendarClock className="size-4" />} onClick={() => setTab('expiring')} />
      </div>
      <Card padded={false}>
        <Tabs
          className="px-4"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'products', label: 'Wg produktów' },
            { value: 'locations', label: 'Wg lokalizacji i palet' },
            { value: 'expiring', label: 'Terminy ważności', count: expiring?.length },
          ]}
        />
        {tab === 'products' && <ByProduct />}
        {tab === 'locations' && <ByLocation />}
        {tab === 'expiring' && <Expiring rows={expiring} />}
      </Card>
      <AdjustModal open={adjust} onClose={() => setAdjust(false)} />
    </>
  );
}

function ByProduct() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [onlyInStock, setOnlyInStock] = useState(true);
  const [page, setPage] = useState(1);
  const q = useDebounce(search);
  const { data, isLoading } = useQuery({
    queryKey: ['inventory', 'summary', q, onlyInStock, page],
    queryFn: () => api.get<Paginated<SummaryRow>>('/inventory/summary', { search: q, onlyInStock, page, pageSize: 25 }),
    placeholderData: keepPreviousData,
  });
  const zone = (n: number) => (n ? <span className="tabular">{num(n)}</span> : <span className="text-slate-300">—</span>);
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 p-4">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="SKU lub nazwa…" />
        <Checkbox label="Tylko z dodatnim stanem" checked={onlyInStock} onChange={setOnlyInStock} />
      </div>
      <DataTable
        loading={isLoading}
        rows={data?.items}
        rowKey={(r) => r.product.id}
        onRowClick={(r) => navigate(`/products/${r.product.id}`)}
        columns={[
          { key: 'sku', header: 'SKU', cell: (r) => <span className="font-mono text-xs font-medium">{r.product.sku}</span> },
          { key: 'name', header: 'Produkt', cell: (r) => <span className="font-medium">{r.product.name}</span> },
          { key: 'rcv', header: 'Przyjęcia', align: 'right', hideOnMobile: true, cell: (r) => zone(r.byType.RECEIVING) },
          { key: 'sto', header: 'Rezerwa', align: 'right', hideOnMobile: true, cell: (r) => zone(r.byType.STORAGE) },
          { key: 'pick', header: 'Kompletacja', align: 'right', hideOnMobile: true, cell: (r) => zone(r.byType.PICKING) },
          { key: 'qua', header: 'Kwarantanna', align: 'right', hideOnMobile: true, cell: (r) => zone(r.byType.QUARANTINE) },
          {
            key: 'total',
            header: 'Razem',
            align: 'right',
            cell: (r) => (
              <span className={`inline-flex items-center gap-1 font-semibold tabular ${r.belowMin ? 'text-red-600' : ''}`}>
                {r.belowMin && <AlertTriangle className="size-3.5" />}
                {num(r.total)} <span className="text-xs font-normal text-slate-400">{UNIT[r.product.unit]}</span>
              </span>
            ),
          },
          { key: 'avg', header: 'Śr. koszt', align: 'right', hideOnMobile: true, cell: (r) => <span className="text-slate-500 tabular">{money(r.avgCost)}</span> },
          { key: 'value', header: 'Wartość', align: 'right', cell: (r) => <span className="tabular">{money(r.value)}</span> },
        ]}
      />
      {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
    </>
  );
}

function ByLocation() {
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [type, setType] = useState<LocationType | ''>('');
  const [page, setPage] = useState(1);
  const [transfer, setTransfer] = useState<StockItem | null>(null);
  const [adjust, setAdjust] = useState<StockItem | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const q = useDebounce(search);
  const { data, isLoading } = useQuery({
    queryKey: ['inventory', 'list', q, type, page],
    queryFn: () => api.get<Paginated<StockItem>>('/inventory', { search: q, locationType: type, page, pageSize: 50 }),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 p-4">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Lokalizacja, SKU, SSCC, partia…" />
        <Select value={type} onChange={(e) => { setType(e.target.value as LocationType); setPage(1); }} className="w-auto">
          <option value="">Wszystkie strefy</option>
          {Object.entries(LOCATION_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </div>
      <DataTable
        loading={isLoading}
        rows={data?.items}
        rowKey={(s) => s.id}
        columns={[
          { key: 'loc', header: 'Lokalizacja', cell: (s) => <Link to={`/locations/${s.locationId}`} className="font-mono text-xs font-medium hover:text-brand-700">{s.location.code}</Link> },
          { key: 'type', header: 'Strefa', hideOnMobile: true, cell: (s) => <LocationTypeBadge type={s.location.type} /> },
          {
            key: 'hu',
            header: 'Jednostka',
            cell: (s) =>
              s.handlingUnit ? (
                <div>
                  <HuCode id={s.handlingUnit.id} code={s.handlingUnit.code} type={s.handlingUnit.type} />
                  {s.handlingUnit.parent && (
                    <p className="text-[11px] text-slate-400">na palecie …{s.handlingUnit.parent.code.slice(-8)}</p>
                  )}
                </div>
              ) : (
                <span className="text-xs text-slate-400">luzem</span>
              ),
          },
          {
            key: 'product',
            header: 'Produkt',
            cell: (s) => (
              <Link to={`/products/${s.productId}`} className="hover:text-brand-700">
                <span className="font-mono text-xs text-slate-500">{s.product.sku}</span>
                <p className="max-w-72 truncate">{s.product.name}</p>
              </Link>
            ),
          },
          { key: 'batch', header: 'Partia / ważność', hideOnMobile: true, cell: (s) => (s.batch || s.expiryDate ? <span className="text-xs">{s.batch ?? '—'}<br /><span className="text-slate-500">{date(s.expiryDate)}</span></span> : '') },
          { key: 'qty', header: 'Ilość', align: 'right', cell: (s) => <span className="font-semibold tabular">{num(s.quantity)}</span> },
          {
            key: 'actions',
            header: '',
            align: 'right',
            cell: (s) =>
              can('MANAGER', 'OPERATOR') && (
                <div className="relative">
                  <button onClick={() => setMenu(menu === s.id ? null : s.id)} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                    <MoreHorizontal className="size-4" />
                  </button>
                  {menu === s.id && (
                    <div className="absolute right-0 z-10 mt-1 w-44 rounded-lg border border-slate-200 bg-white py-1 text-left text-sm shadow-lg" onMouseLeave={() => setMenu(null)}>
                      <button className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-slate-50" onClick={() => { setTransfer(s); setMenu(null); }}>
                        <ArrowRightLeft className="size-3.5" /> Przesuń
                      </button>
                      <button className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-slate-50" onClick={() => { setAdjust(s); setMenu(null); }}>
                        <SlidersHorizontal className="size-3.5" /> Korekta / zużycie
                      </button>
                    </div>
                  )}
                </div>
              ),
          },
        ]}
      />
      {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
      <TransferModal item={transfer} onClose={() => setTransfer(null)} />
      <AdjustModal open={!!adjust} item={adjust} onClose={() => setAdjust(null)} />
    </>
  );
}

function Expiring({ rows }: { rows?: StockItem[] }) {
  return (
    <DataTable
      rows={rows}
      rowKey={(s) => s.id}
      empty="Brak partii z kończącym się terminem ważności"
      columns={[
        {
          key: 'days',
          header: 'Pozostało',
          cell: (s) => {
            const d = daysUntil(s.expiryDate!);
            return <span className={`font-semibold tabular ${d < 0 ? 'text-red-600' : d < 14 ? 'text-amber-600' : ''}`}>{d < 0 ? `${-d} dni po terminie` : `${d} dni`}</span>;
          },
        },
        { key: 'exp', header: 'Data ważności', cell: (s) => date(s.expiryDate) },
        { key: 'product', header: 'Produkt', cell: (s) => <Link to={`/products/${s.product.id}`} className="hover:text-brand-700"><span className="font-mono text-xs text-slate-500">{s.product.sku}</span> {s.product.name}</Link> },
        { key: 'batch', header: 'Partia', cell: (s) => s.batch ?? '—' },
        { key: 'loc', header: 'Lokalizacja', cell: (s) => <span className="font-mono text-xs">{s.location.code}</span> },
        { key: 'qty', header: 'Ilość', align: 'right', cell: (s) => <span className="font-semibold tabular">{num(s.quantity)}</span> },
      ]}
    />
  );
}
