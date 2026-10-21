import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlertTriangle, Package, Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '@/api/client';
import type { Paginated, Product } from '@/api/types';
import { PageHeader } from '@/components/PageHeader';
import { SearchInput } from '@/components/SearchInput';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Checkbox, Select } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/Feedback';
import { DataTable, Pagination } from '@/components/ui/Table';
import { useDebounce } from '@/hooks/useDebounce';
import { useAuth } from '@/lib/auth';
import { money, num, UNIT } from '@/lib/format';
import { ProductFormModal } from './ProductFormModal';

export default function ProductsPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [lowStock, setLowStock] = useState(false);
  const [inactive, setInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(false);
  const q = useDebounce(search);

  const { data, isLoading } = useQuery({
    queryKey: ['products', q, category, lowStock, inactive, page],
    queryFn: () => api.get<Paginated<Product>>('/products', { search: q, category, lowStock, includeInactive: inactive, page, pageSize: 25 }),
    placeholderData: keepPreviousData,
  });
  const { data: categories = [] } = useQuery({ queryKey: ['products', 'categories'], queryFn: () => api.get<string[]>('/products/categories') });

  return (
    <>
      <PageHeader
        title="Produkty"
        description="Kartoteka towarów i materiałów — progi minimalne, ceny, parametry logistyczne"
        actions={can('MANAGER') && <Button icon={<Plus className="size-4" />} onClick={() => setModal(true)}>Nowy produkt</Button>}
      />
      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="SKU, nazwa lub EAN…" />
          <Select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} className="w-auto">
            <option value="">Wszystkie kategorie</option>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </Select>
          <Checkbox label="Tylko poniżej minimum" checked={lowStock} onChange={(v) => { setLowStock(v); setPage(1); }} />
          <Checkbox label="Pokaż nieaktywne" checked={inactive} onChange={setInactive} />
        </div>
        <DataTable
          loading={isLoading}
          rows={data?.items}
          rowKey={(p) => p.id}
          onRowClick={(p) => navigate(`/products/${p.id}`)}
          empty={<EmptyState icon={<Package className="size-6" />} title="Brak produktów" description="Zmień filtry lub dodaj pierwszy produkt." />}
          rowClassName={(p) => (!p.active ? 'opacity-50' : undefined)}
          columns={[
            { key: 'sku', header: 'SKU', cell: (p) => <span className="font-mono text-xs font-medium">{p.sku}</span> },
            {
              key: 'name',
              header: 'Nazwa',
              cell: (p) => (
                <div className="min-w-48">
                  <p className="font-medium text-slate-900">{p.name}</p>
                  <p className="text-xs text-slate-500">
                    {p.category ?? 'bez kategorii'}
                    {p.ean && ` · EAN ${p.ean}`}
                  </p>
                </div>
              ),
            },
            {
              key: 'flags',
              header: '',
              hideOnMobile: true,
              cell: (p) => (
                <div className="flex gap-1">
                  {p.isPackaging && <Badge tone="violet">opakowanie</Badge>}
                  {p.trackBatches && <Badge tone="blue">partie</Badge>}
                  {!p.active && <Badge>nieaktywny</Badge>}
                </div>
              ),
            },
            {
              key: 'stock',
              header: 'Stan',
              align: 'right',
              cell: (p) => (
                <span className={`inline-flex items-center gap-1.5 font-medium tabular ${p.belowMin ? 'text-red-600' : ''}`}>
                  {p.belowMin && <AlertTriangle className="size-3.5" />}
                  {num(p.stock)} <span className="text-xs font-normal text-slate-400">{UNIT[p.unit]}</span>
                </span>
              ),
            },
            { key: 'min', header: 'Minimum', align: 'right', hideOnMobile: true, cell: (p) => <span className="text-slate-500 tabular">{p.minStock ? num(p.minStock) : '—'}</span> },
            {
              key: 'pick',
              header: 'Kompletacja',
              hideOnMobile: true,
              cell: (p) => p.pickFaces.map((f) => <span key={f.id} className="font-mono text-xs">{f.location.code}</span>),
            },
            { key: 'cost', header: 'Śr. koszt', align: 'right', hideOnMobile: true, cell: (p) => <span className="tabular">{money(p.avgCost)}</span> },
            { key: 'price', header: 'Cena netto', align: 'right', cell: (p) => <span className="tabular">{money(p.salePrice)}</span> },
          ]}
        />
        {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
      </Card>
      <ProductFormModal open={modal} onClose={() => setModal(false)} categories={categories} />
    </>
  );
}
