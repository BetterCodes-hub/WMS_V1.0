import { useQuery } from '@tanstack/react-query';
import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '@/api/client';
import type { Location, Movement, Paginated, ProductDetail } from '@/api/types';
import { MovementsTable } from '@/pages/inventory/MovementsTable';
import { HuCode } from '@/components/HuCode';
import { PageHeader } from '@/components/PageHeader';
import { LocationPicker } from '@/components/Pickers';
import { AlertTypeBadge, LocationTypeBadge } from '@/components/StatusBadge';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, StatCard } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Field';
import { EmptyState, Notice, Progress, Spinner } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { DataTable } from '@/components/ui/Table';
import { useMutate } from '@/hooks/useMutate';
import { useAuth } from '@/lib/auth';
import { date, daysUntil, money, num, pln, UNIT } from '@/lib/format';
import { ProductFormModal } from './ProductFormModal';

export default function ProductDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const [edit, setEdit] = useState(false);
  const [pf, setPf] = useState(false);
  const { data: p } = useQuery({ queryKey: ['product', id], queryFn: () => api.get<ProductDetail>(`/products/${id}`) });
  const { data: movements } = useQuery({
    queryKey: ['inventory', 'movements', 'product', id],
    queryFn: () => api.get<Paginated<Movement>>('/inventory/movements', { productId: id, pageSize: 15 }),
  });
  const { data: categories = [] } = useQuery({ queryKey: ['products', 'categories'], queryFn: () => api.get<string[]>('/products/categories') });
  const removePf = useMutate((pfId: string) => api.delete(`/products/${id}/pick-faces/${pfId}`), {
    invalidate: [['product', id!], ['replenishment']],
    success: 'Usunięto miejsce kompletacji',
  });

  if (!p) return <Spinner className="py-32" />;
  const alert = p.alerts[0];
  const byLocation = p.stock;

  return (
    <>
      <PageHeader
        back={{ to: '/products', label: 'Produkty' }}
        title={p.name}
        badge={<span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-sm text-slate-600">{p.sku}</span>}
        description={[p.category, p.ean && `EAN ${p.ean}`].filter(Boolean).join(' · ')}
        actions={can('MANAGER') && <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setEdit(true)}>Edytuj</Button>}
      />

      {alert && (
        <div className="mb-6">
          <Notice tone={alert.type === 'OUT_OF_STOCK' ? 'danger' : 'warning'}>
            <strong>{alert.type === 'OUT_OF_STOCK' ? 'Brak towaru' : 'Stan poniżej minimum'}</strong> — aktualnie {num(p.totalStock)} {UNIT[p.unit]}, minimum {num(p.minStock)}.{' '}
            {p.reorderQty > 0 && <>Sugerowane zamówienie: {num(p.reorderQty)} {UNIT[p.unit]}. </>}
            {can('MANAGER', 'OPERATOR') && (
              <Link to={`/receipts/new?product=${p.id}&qty=${p.reorderQty || p.minStock * 2}`} className="font-medium underline">
                Utwórz awizację dostawy
              </Link>
            )}
          </Notice>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Stan łączny" value={`${num(p.totalStock)} ${UNIT[p.unit]}`} hint={p.minStock ? `minimum ${num(p.minStock)}` : 'bez progu alertu'} tone={alert ? 'red' : 'slate'} />
        <StatCard label="Wartość (śr. koszt)" value={pln(p.stockValue)} hint={`${money(p.avgCost)} zł / ${UNIT[p.unit]}`} />
        <StatCard label="Cena sprzedaży" value={`${money(p.salePrice)} zł`} hint={`netto · VAT ${p.vatRate}%`} />
        <StatCard label="Marża jednostkowa" value={`${money(p.salePrice - p.avgCost)} zł`} hint={p.salePrice ? `${Math.round(((p.salePrice - p.avgCost) / p.salePrice) * 100)}% ceny` : undefined} />
        <StatCard label="Opakowania" value={p.unitsPerPallet ? `${num(p.unitsPerPallet)} / pal.` : '—'} hint={p.unitsPerCarton ? `${p.unitsPerCarton} szt. w kartonie` : undefined} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card padded={false} className="xl:col-span-2">
          <CardHeader title="Rozmieszczenie w magazynie" description="Kolejność wg FEFO — najkrótsza data ważności na górze" icon={<MapPin className="size-4" />} />
          <DataTable
            rows={byLocation}
            rowKey={(s) => s.id}
            empty="Brak towaru na stanie"
            columns={[
              { key: 'loc', header: 'Lokalizacja', cell: (s) => <Link to={`/locations/${s.locationId}`} className="font-mono text-xs font-medium hover:text-brand-700">{s.location.code}</Link> },
              { key: 'type', header: 'Strefa', hideOnMobile: true, cell: (s) => <LocationTypeBadge type={s.location.type} /> },
              {
                key: 'hu',
                header: 'Jednostka',
                cell: (s) =>
                  s.handlingUnit ? (
                    <HuCode id={s.handlingUnit.id} code={s.handlingUnit.code} type={s.handlingUnit.type} />
                  ) : (
                    <span className="text-xs text-slate-400">luzem</span>
                  ),
              },
              { key: 'batch', header: 'Partia', hideOnMobile: true, cell: (s) => s.batch ?? <span className="text-slate-400">—</span> },
              {
                key: 'exp',
                header: 'Ważność',
                hideOnMobile: true,
                cell: (s) => (s.expiryDate ? <span className={daysUntil(s.expiryDate) < 30 ? 'font-medium text-amber-600' : ''}>{date(s.expiryDate)}</span> : '—'),
              },
              { key: 'qty', header: 'Ilość', align: 'right', cell: (s) => <span className="font-medium tabular">{num(s.quantity)}</span> },
            ]}
          />
        </Card>

        <Card padded={false}>
          <CardHeader
            title="Miejsca kompletacji"
            description="Parametry uzupełniania (min / max)"
            actions={can('MANAGER') && <Button size="sm" variant="secondary" icon={<Plus className="size-3.5" />} onClick={() => setPf(true)}>Dodaj</Button>}
          />
          {p.pickFaces.length ? (
            <ul className="divide-y divide-slate-100">
              {p.pickFaces.map((f) => {
                const current = p.stock.filter((s) => s.locationId === f.locationId).reduce((sum, s) => sum + s.quantity, 0);
                return (
                  <li key={f.id} className="px-5 py-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm font-medium">{f.location.code}</span>
                      <div className="flex items-center gap-2">
                        {current <= f.minQty ? <Badge tone="amber">do uzupełnienia</Badge> : <Badge tone="green">OK</Badge>}
                        {can('MANAGER') && (
                          <button onClick={() => removePf.mutate(f.id)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Usuń">
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    <Progress value={(current / f.maxQty) * 100} marker={(f.minQty / f.maxQty) * 100} tone={current <= f.minQty ? 'amber' : 'green'} className="mt-2" />
                    <p className="mt-1 text-xs text-slate-500 tabular">
                      {num(current)} / max {num(f.maxQty)} · min {num(f.minQty)}
                    </p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState title="Brak miejsca kompletacji" description="Przypisz lokalizację typu Kompletacja, aby system pilnował uzupełnień." />
          )}
          {p.alerts.length > 0 && (
            <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
              Alert: <AlertTypeBadge type={p.alerts[0].type} /> od {date(p.alerts[0].createdAt)}
            </div>
          )}
        </Card>
      </div>

      <Card padded={false} className="mt-6">
        <CardHeader title="Ostatnie ruchy" actions={<Link to={`/movements?productId=${p.id}`} className="text-xs font-medium text-brand-600 hover:underline">Pełna historia</Link>} />
        <MovementsTable rows={movements?.items} compact />
      </Card>

      <ProductFormModal open={edit} onClose={() => setEdit(false)} product={p as never} categories={categories} />
      <PickFaceModal open={pf} onClose={() => setPf(false)} productId={p.id} unitsPerCarton={p.unitsPerCarton} />
    </>
  );
}

function PickFaceModal({ open, onClose, productId, unitsPerCarton }: { open: boolean; onClose: () => void; productId: string; unitsPerCarton?: number | null }) {
  const [location, setLocation] = useState<Location | null>(null);
  const [min, setMin] = useState('10');
  const [max, setMax] = useState(String((unitsPerCarton ?? 10) * 4));
  const save = useMutate(() => api.put(`/products/${productId}/pick-faces`, { locationId: location!.id, minQty: Number(min), maxQty: Number(max) }), {
    invalidate: [['product', productId], ['replenishment']],
    success: 'Zapisano miejsce kompletacji',
    onSuccess: onClose,
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Miejsce kompletacji"
      description="Gdy stan spadnie do minimum, system zaproponuje uzupełnienie do maksimum z rezerwy."
      size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Anuluj</Button><Button onClick={() => save.mutate()} disabled={!location} loading={save.isPending}>Zapisz</Button></>}
    >
      <div className="space-y-4">
        <Field label="Lokalizacja kompletacyjna">
          <LocationPicker value={location} onChange={setLocation} types={['PICKING']} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Minimum (próg)"><Input type="number" min={0} value={min} onChange={(e) => setMin(e.target.value)} /></Field>
          <Field label="Maksimum (pojemność)"><Input type="number" min={1} value={max} onChange={(e) => setMax(e.target.value)} /></Field>
        </div>
      </div>
    </Modal>
  );
}
