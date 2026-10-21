import { useQuery } from '@tanstack/react-query';
import { Power } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { api } from '@/api/client';
import type { Location, PickFace, Product, StockItem } from '@/api/types';
import { HuCode } from '@/components/HuCode';
import { PageHeader } from '@/components/PageHeader';
import { LocationTypeBadge } from '@/components/StatusBadge';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, StatCard } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Feedback';
import { DataTable } from '@/components/ui/Table';
import { useMutate } from '@/hooks/useMutate';
import { useAuth } from '@/lib/auth';
import { date, num } from '@/lib/format';

type Detail = Omit<Location, 'totalQty' | 'stockLines' | 'pallets'> & { stock: StockItem[]; pickFaces: (PickFace & { product: Product })[] };

export default function LocationDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const { data: l } = useQuery({ queryKey: ['location', id], queryFn: () => api.get<Detail>(`/locations/${id}`) });
  const toggle = useMutate(() => api.patch(`/locations/${id}`, { active: !l?.active }), {
    invalidate: [['location', id!], ['locations']],
    success: l?.active ? 'Lokalizacja zablokowana' : 'Lokalizacja aktywna',
  });
  if (!l) return <Spinner className="py-32" />;
  const total = l.stock.reduce((s, i) => s + i.quantity, 0);
  const units = new Set(l.stock.map((s) => s.handlingUnit?.id).filter(Boolean)).size;

  return (
    <>
      <PageHeader
        back={{ to: '/locations', label: 'Lokalizacje' }}
        title={<span className="font-mono">{l.code}</span>}
        badge={<><LocationTypeBadge type={l.type} />{!l.active && <Badge tone="red">zablokowana</Badge>}</>}
        description={[l.name, `strefa ${l.zone}`, l.maxPallets && `pojemność ${l.maxPallets} pal.`].filter(Boolean).join(' · ')}
        actions={can('MANAGER') && <Button variant="secondary" icon={<Power className="size-4" />} onClick={() => toggle.mutate()} loading={toggle.isPending}>{l.active ? 'Zablokuj' : 'Odblokuj'}</Button>}
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Ilość łączna" value={num(total)} />
        <StatCard label="Pozycje stanu" value={l.stock.length} />
        <StatCard label="Jednostki logistyczne" value={units} hint={l.maxPallets ? `limit ${l.maxPallets} pal.` : undefined} />
        <StatCard label="Miejsce kompletacji dla" value={l.pickFaces.length || '—'} hint={l.pickFaces.map((p) => p.product.sku).join(', ')} />
      </div>
      <Card padded={false}>
        <CardHeader title="Zawartość lokalizacji" />
        <DataTable
          rows={l.stock}
          rowKey={(s) => s.id}
          empty="Lokalizacja jest pusta"
          columns={[
            { key: 'product', header: 'Produkt', cell: (s) => <Link to={`/products/${s.productId}`} className="hover:text-brand-700"><span className="font-mono text-xs text-slate-500">{s.product.sku}</span> {s.product.name}</Link> },
            { key: 'hu', header: 'Jednostka', cell: (s) => (s.handlingUnit ? <HuCode id={s.handlingUnit.id} code={s.handlingUnit.code} type={s.handlingUnit.type} /> : <span className="text-xs text-slate-400">luzem</span>) },
            { key: 'batch', header: 'Partia', cell: (s) => s.batch ?? '—' },
            { key: 'exp', header: 'Ważność', cell: (s) => date(s.expiryDate) },
            { key: 'qty', header: 'Ilość', align: 'right', cell: (s) => <span className="font-semibold tabular">{num(s.quantity)}</span> },
          ]}
        />
      </Card>
    </>
  );
}
