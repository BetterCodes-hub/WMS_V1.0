import { useQuery } from '@tanstack/react-query';
import { BellOff, Check, CheckCircle2, PackagePlus, PackageX, TrendingDown } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '@/api/client';
import type { Alert, AlertStatus } from '@/api/types';
import { PageHeader } from '@/components/PageHeader';
import { AlertTypeBadge } from '@/components/StatusBadge';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, StatCard } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Field';
import { EmptyState, Progress, Spinner } from '@/components/ui/Feedback';
import { Tabs } from '@/components/ui/Tabs';
import { useMutate } from '@/hooks/useMutate';
import { useAuth } from '@/lib/auth';
import { dateTime, num, relative, UNIT } from '@/lib/format';

export default function AlertsPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [status, setStatus] = useState<'ACTIVE' | AlertStatus>('ACTIVE');
  const [packagingOnly, setPackagingOnly] = useState(false);
  const { data } = useQuery({ queryKey: ['alerts', status], queryFn: () => api.get<Alert[]>('/alerts', { status }) });
  const { data: summary } = useQuery({ queryKey: ['alerts', 'summary'], queryFn: () => api.get<{ total: number; open: number; outOfStock: number; lowStock: number }>('/alerts/summary') });
  const ack = useMutate((id: string) => api.post(`/alerts/${id}/acknowledge`), { invalidate: [['alerts']], success: 'Alert potwierdzony' });

  const rows = (data ?? []).filter((a) => !packagingOnly || a.product.isPackaging);

  return (
    <>
      <PageHeader
        title="Alerty stanów"
        description="Powiadomienia o spadku stanu poniżej poziomu minimalnego — np. kartony i materiały opakowaniowe"
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Aktywne alerty" value={summary?.total ?? '—'} tone={summary?.total ? 'red' : 'green'} icon={<TrendingDown className="size-4" />} />
        <StatCard label="Nowe (niepotwierdzone)" value={summary?.open ?? '—'} tone={summary?.open ? 'amber' : 'slate'} />
        <StatCard label="Brak towaru" value={summary?.outOfStock ?? '—'} tone={summary?.outOfStock ? 'red' : 'slate'} icon={<PackageX className="size-4" />} />
        <StatCard label="Niski stan" value={summary?.lowStock ?? '—'} tone={summary?.lowStock ? 'amber' : 'slate'} />
      </div>

      <Card padded={false}>
        <div className="flex flex-wrap items-end justify-between gap-3 px-4 pt-2">
          <Tabs value={status} onChange={setStatus} tabs={[{ value: 'ACTIVE', label: 'Aktywne' }, { value: 'RESOLVED', label: 'Rozwiązane' }]} />
          <div className="mb-3"><Checkbox label="Tylko materiały opakowaniowe" checked={packagingOnly} onChange={setPackagingOnly} /></div>
        </div>
        {!data ? (
          <Spinner className="py-16" />
        ) : rows.length ? (
          <ul className="divide-y divide-slate-100">
            {rows.map((a) => {
              const pct = a.threshold ? (a.currentQty / a.threshold) * 100 : 0;
              const missing = Math.max(0, a.threshold - a.currentQty);
              const orderQty = Math.max(a.product.reorderQty, missing);
              return (
                <li key={a.id} className="grid gap-4 px-5 py-4 md:grid-cols-12 md:items-center">
                  <div className="flex items-start gap-3 md:col-span-5">
                    <div className={`mt-0.5 rounded-lg p-2 ${a.type === 'OUT_OF_STOCK' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
                      {a.type === 'OUT_OF_STOCK' ? <PackageX className="size-5" /> : <TrendingDown className="size-5" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <AlertTypeBadge type={a.type} />
                        {a.product.isPackaging && <Badge tone="violet">opakowanie</Badge>}
                        {a.status === 'OPEN' && <Badge tone="red">nowy</Badge>}
                        {a.status === 'ACKNOWLEDGED' && <Badge>potwierdzony</Badge>}
                      </div>
                      <Link to={`/products/${a.productId}`} className="mt-1 block font-medium hover:text-brand-700">{a.product.name}</Link>
                      <p className="text-xs text-slate-500">
                        <span className="font-mono">{a.product.sku}</span> · {a.status === 'RESOLVED' ? `rozwiązano ${dateTime(a.resolvedAt)}` : `od ${relative(a.createdAt)}`}
                        {a.acknowledgedBy && ` · potwierdził ${a.acknowledgedBy.name}`}
                      </p>
                    </div>
                  </div>
                  <div className="md:col-span-4">
                    <div className="flex items-baseline justify-between text-sm">
                      <span><strong className="text-lg tabular">{num(a.currentQty)}</strong> <span className="text-slate-500">{UNIT[a.product.unit]}</span></span>
                      <span className="text-xs text-slate-500">minimum {num(a.threshold)}</span>
                    </div>
                    <Progress value={pct} tone={a.type === 'OUT_OF_STOCK' ? 'red' : 'amber'} className="mt-1.5 h-2.5" />
                    {a.status !== 'RESOLVED' && <p className="mt-1 text-xs text-slate-500">Brakuje {num(missing)} do minimum · sugerowane zamówienie {num(orderQty)}</p>}
                  </div>
                  <div className="flex flex-wrap justify-end gap-2 md:col-span-3">
                    {a.status === 'OPEN' && (
                      <Button size="sm" variant="secondary" icon={<Check className="size-3.5" />} onClick={() => ack.mutate(a.id)}>Potwierdź</Button>
                    )}
                    {a.status !== 'RESOLVED' && can('MANAGER', 'OPERATOR') && (
                      <Button size="sm" icon={<PackagePlus className="size-3.5" />} onClick={() => navigate(`/receipts/new?product=${a.productId}&qty=${orderQty}`)}>Zamów dostawę</Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : status === 'ACTIVE' ? (
          <EmptyState icon={<CheckCircle2 className="size-6" />} title="Brak aktywnych alertów" description="Wszystkie produkty mają stan powyżej zdefiniowanego minimum." />
        ) : (
          <EmptyState icon={<BellOff className="size-6" />} title="Brak rozwiązanych alertów" />
        )}
      </Card>
    </>
  );
}
