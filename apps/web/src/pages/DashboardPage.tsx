import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeftRight, Boxes, CalendarClock, PackageCheck, Truck, Warehouse } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '@/api/client';
import type { Alert, StockItem } from '@/api/types';
import { PageHeader } from '@/components/PageHeader';
import { AlertTypeBadge } from '@/components/StatusBadge';
import { Card, CardHeader, StatCard } from '@/components/ui/Card';
import { EmptyState, Progress, Spinner } from '@/components/ui/Feedback';
import { useAuth } from '@/lib/auth';
import { date, daysUntil, num, pln } from '@/lib/format';

interface Dashboard {
  stockValue: number;
  stockQuantity: number;
  products: number;
  alerts: { total: number; open: number; outOfStock: number; lowStock: number };
  replenishment: { open: number; urgent: number };
  receiptsOpen: number;
  issuesDraft: number;
  issuesToday: number;
  occupancy: { used: number; total: number; percent: number };
  movements: { date: string; receipts: number; issues: number }[];
  topIssued: { productId: string; sku: string; name: string; qty: number }[];
  recentAlerts: Alert[];
}

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data } = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<Dashboard>('/dashboard'), refetchInterval: 60_000 });
  const { data: repl } = useQuery({
    queryKey: ['replenishment'],
    queryFn: () => api.get<{ stats: { required: number; noReserve: number; inProgress: number } }>('/replenishment'),
  });
  const { data: expiring } = useQuery({
    queryKey: ['inventory', 'expiring'],
    queryFn: () => api.get<StockItem[]>('/inventory/expiring'),
  });

  if (!data) return <Spinner className="py-32" />;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Dzień dobry' : hour < 18 ? 'Witaj' : 'Dobry wieczór';

  return (
    <>
      <PageHeader
        title={`${greeting}, ${user?.name.split(' ')[0]}`}
        description={new Date().toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Wartość magazynu" value={pln(data.stockValue)} hint={`${num(data.stockQuantity)} jedn. · ${data.products} SKU`} icon={<Warehouse className="size-4" />} tone="brand" />
        <StatCard
          label="Alerty stanów"
          value={data.alerts.total}
          hint={data.alerts.outOfStock ? `${data.alerts.outOfStock} brak towaru` : `${data.alerts.open} nowych`}
          icon={<AlertTriangle className="size-4" />}
          tone={data.alerts.total ? 'red' : 'green'}
          onClick={() => navigate('/alerts')}
        />
        <StatCard
          label="Do uzupełnienia"
          value={repl?.stats.required ?? '—'}
          hint={`${data.replenishment.open} otwartych zadań${data.replenishment.urgent ? ` · ${data.replenishment.urgent} pilne` : ''}`}
          icon={<ArrowLeftRight className="size-4" />}
          tone={repl?.stats.required ? 'amber' : 'green'}
          onClick={() => navigate('/replenishment')}
        />
        <StatCard label="Przyjęcia w toku" value={data.receiptsOpen} hint="awizacje i rozładunki" icon={<PackageCheck className="size-4" />} onClick={() => navigate('/receipts')} />
        <StatCard label="Wydania dziś" value={data.issuesToday} hint={`${data.issuesDraft} WZ w przygotowaniu`} icon={<Truck className="size-4" />} onClick={() => navigate('/issues')} />
        <StatCard label="Zajętość regałów" value={`${data.occupancy.percent}%`} hint={`${data.occupancy.used} z ${data.occupancy.total} miejsc`} icon={<Boxes className="size-4" />} onClick={() => navigate('/locations')} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card padded={false} className="xl:col-span-2">
          <CardHeader title="Ruch towaru — ostatnie 14 dni" description="Ilość przyjęta i wydana (jednostki)" />
          <div className="h-72 px-2 py-4">
            <ResponsiveContainer>
              <BarChart data={data.movements} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="date" tickFormatter={(d) => d.slice(8, 10) + '.' + d.slice(5, 7)} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={48} />
                <Tooltip
                  cursor={{ fill: '#f1f5f9' }}
                  labelFormatter={(d) => date(d as string)}
                  formatter={(v: number, name) => [num(v), name === 'receipts' ? 'Przyjęcia' : 'Wydania']}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                />
                <Legend formatter={(v) => (v === 'receipts' ? 'Przyjęcia' : 'Wydania')} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="receipts" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={22} />
                <Bar dataKey="issues" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card padded={false}>
          <CardHeader
            title="Aktywne alerty"
            icon={<AlertTriangle className="size-4" />}
            actions={<Link to="/alerts" className="text-xs font-medium text-brand-600 hover:underline">Wszystkie</Link>}
          />
          {data.recentAlerts.length ? (
            <ul className="divide-y divide-slate-100">
              {data.recentAlerts.map((a) => (
                <li key={a.id}>
                  <Link to={`/products/${a.productId}`} className="block px-5 py-3 hover:bg-slate-50">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-slate-500">{a.product.sku}</span>
                      <AlertTypeBadge type={a.type} />
                    </div>
                    <p className="mt-0.5 truncate text-sm font-medium">{a.product.name}</p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <Progress value={(a.currentQty / a.threshold) * 100} tone={a.type === 'OUT_OF_STOCK' ? 'red' : 'amber'} />
                      <span className="shrink-0 text-xs text-slate-500 tabular">{num(a.currentQty)} / {num(a.threshold)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Brak alertów" description="Wszystkie stany powyżej minimum." />
          )}
        </Card>

        <Card padded={false}>
          <CardHeader title="Najczęściej wydawane" description="Ostatnie 30 dni" />
          {data.topIssued.length ? (
            <ul className="space-y-3 px-5 py-4">
              {data.topIssued.map((t) => (
                <li key={t.productId}>
                  <Link to={`/products/${t.productId}`} className="group block">
                    <div className="flex justify-between gap-2 text-sm">
                      <span className="truncate group-hover:text-brand-700">{t.name}</span>
                      <span className="shrink-0 font-medium tabular">{num(t.qty)}</span>
                    </div>
                    <Progress value={(t.qty / data.topIssued[0].qty) * 100} className="mt-1 h-1.5" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Brak wydań" />
          )}
        </Card>

        <Card padded={false} className="xl:col-span-2">
          <CardHeader title="Kończące się terminy ważności" icon={<CalendarClock className="size-4" />} description="Partie do priorytetowej sprzedaży (FEFO)" />
          {expiring?.length ? (
            <ul className="divide-y divide-slate-100">
              {expiring.slice(0, 6).map((s) => {
                const days = daysUntil(s.expiryDate!);
                return (
                  <li key={s.id} className="flex items-center gap-4 px-5 py-2.5 text-sm">
                    <span className={`w-20 shrink-0 font-medium tabular ${days < 0 ? 'text-red-600' : days < 14 ? 'text-amber-600' : 'text-slate-600'}`}>
                      {days < 0 ? 'przeterminowane' : `${days} dni`}
                    </span>
                    <Link to={`/products/${s.product.id}`} className="min-w-0 flex-1 truncate hover:text-brand-700">
                      {s.product.name}
                    </Link>
                    <span className="hidden text-xs text-slate-500 sm:inline">partia {s.batch ?? '—'}</span>
                    <span className="font-mono text-xs">{s.location.code}</span>
                    <span className="w-16 text-right font-medium tabular">{num(s.quantity)}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState title="Brak partii z kończącym się terminem" />
          )}
        </Card>
      </div>
    </>
  );
}
