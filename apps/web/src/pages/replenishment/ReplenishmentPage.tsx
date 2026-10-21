import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, CircleAlert, ClipboardCheck, Clock, PackageX, Play, Wand2, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '@/api/client';
import type { ReplenishmentRow, ReplenishmentTask, TaskStatus } from '@/api/types';
import { PageHeader } from '@/components/PageHeader';
import { PriorityBadge } from '@/components/StatusBadge';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, StatCard } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Field';
import { EmptyState, Progress, Spinner } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { DataTable } from '@/components/ui/Table';
import { Tabs } from '@/components/ui/Tabs';
import { useMutate } from '@/hooks/useMutate';
import { useAuth } from '@/lib/auth';
import { date, dateTime, num, relative, UNIT } from '@/lib/format';

const INVALIDATE = [['replenishment'], ['inventory'], ['dashboard'], ['product'], ['location'], ['handling-unit']];

const STATUS = {
  REQUIRED: { label: 'Do uzupełnienia', tone: 'amber' as const, icon: <CircleAlert className="size-3.5" /> },
  NO_RESERVE: { label: 'Brak w rezerwie', tone: 'red' as const, icon: <PackageX className="size-3.5" /> },
  IN_PROGRESS: { label: 'Zadanie w toku', tone: 'blue' as const, icon: <Clock className="size-3.5" /> },
  OK: { label: 'OK', tone: 'green' as const, icon: <CheckCircle2 className="size-3.5" /> },
};

type Filter = 'needed' | 'all' | 'tasks' | 'history';

export default function ReplenishmentPage() {
  const { can } = useAuth();
  const canOperate = can('MANAGER', 'OPERATOR');
  const [filter, setFilter] = useState<Filter>('needed');
  const { data } = useQuery({ queryKey: ['replenishment'], queryFn: () => api.get<{ rows: ReplenishmentRow[]; stats: Record<string, number> }>('/replenishment') });
  const { data: tasks } = useQuery({ queryKey: ['replenishment', 'tasks', 'OPEN'], queryFn: () => api.get<ReplenishmentTask[]>('/replenishment/tasks') });

  const generate = useMutate((pickFaceIds?: string[]) => api.post<{ created: number }>('/replenishment/generate', { pickFaceIds }), {
    invalidate: INVALIDATE,
    success: (r) => (r.created ? `Utworzono zadania: ${r.created}` : 'Brak nowych zadań do utworzenia'),
  });

  if (!data) return <Spinner className="py-32" />;
  const rows = filter === 'all' ? data.rows : data.rows.filter((r) => r.status !== 'OK');

  return (
    <>
      <PageHeader
        title="Replenishment"
        description="Uzupełnianie miejsc kompletacji z rezerwy — co, skąd i dokąd trzeba dołożyć"
        actions={
          canOperate && data.stats.required > 0 && (
            <Button icon={<Wand2 className="size-4" />} onClick={() => generate.mutate(undefined)} loading={generate.isPending}>
              Generuj wszystkie zadania ({data.stats.required})
            </Button>
          )
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Do uzupełnienia" value={data.stats.required} icon={<CircleAlert className="size-4" />} tone={data.stats.required ? 'amber' : 'green'} onClick={() => setFilter('needed')} />
        <StatCard label="Brak towaru w rezerwie" value={data.stats.noReserve} hint="wymaga dostawy" icon={<PackageX className="size-4" />} tone={data.stats.noReserve ? 'red' : 'slate'} />
        <StatCard label="Otwarte zadania" value={tasks?.length ?? 0} icon={<ClipboardCheck className="size-4" />} tone="brand" onClick={() => setFilter('tasks')} />
        <StatCard label="Miejsca w normie" value={data.stats.ok} hint={`z ${data.rows.length} miejsc kompletacji`} icon={<CheckCircle2 className="size-4" />} tone="green" onClick={() => setFilter('all')} />
      </div>

      <Card padded={false}>
        <Tabs
          className="px-4"
          value={filter}
          onChange={setFilter}
          tabs={[
            { value: 'needed', label: 'Wymaga uwagi', count: data.rows.filter((r) => r.status !== 'OK').length },
            { value: 'all', label: 'Wszystkie miejsca', count: data.rows.length },
            { value: 'tasks', label: 'Zadania otwarte', count: tasks?.length },
            { value: 'history', label: 'Historia' },
          ]}
        />
        {(filter === 'needed' || filter === 'all') &&
          (rows.length ? (
            <ul className="divide-y divide-slate-100">
              {rows.map((r) => <PickFaceRow key={r.pickFaceId} row={r} canOperate={canOperate} onGenerate={() => generate.mutate([r.pickFaceId])} busy={generate.isPending} />)}
            </ul>
          ) : (
            <EmptyState icon={<CheckCircle2 className="size-6" />} title="Wszystkie miejsca kompletacji są zatowarowane" description="Gdy stan spadnie do minimum, pozycja pojawi się tutaj automatycznie." />
          ))}
        {filter === 'tasks' && <TaskList status="OPEN" canOperate={canOperate} />}
        {filter === 'history' && <TaskList status="DONE" canOperate={false} />}
      </Card>
    </>
  );
}

function PickFaceRow({ row: r, canOperate, onGenerate, busy }: { row: ReplenishmentRow; canOperate: boolean; onGenerate: () => void; busy: boolean }) {
  const s = STATUS[r.status];
  const unit = UNIT[r.product.unit];
  return (
    <li className="grid gap-4 px-5 py-4 lg:grid-cols-12 lg:items-center">
      <div className="lg:col-span-3">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-brand-50 px-2 py-0.5 font-mono text-sm font-semibold text-brand-700">{r.location.code}</span>
          {r.status !== 'OK' && <PriorityBadge priority={r.priority} />}
        </div>
        <Link to={`/products/${r.product.id}`} className="mt-1 block truncate text-sm font-medium hover:text-brand-700">{r.product.name}</Link>
        <p className="font-mono text-xs text-slate-500">{r.product.sku}</p>
      </div>

      <div className="lg:col-span-3">
        <div className="flex items-baseline justify-between text-sm">
          <span><strong className="text-lg tabular">{num(r.current)}</strong> <span className="text-slate-500">/ {num(r.maxQty)} {unit}</span></span>
          <span className="text-xs text-slate-500">min {num(r.minQty)}</span>
        </div>
        <Progress value={r.fillPercent} marker={(r.minQty / r.maxQty) * 100} tone={r.current === 0 ? 'red' : r.status === 'OK' ? 'green' : 'amber'} className="mt-1.5 h-2.5" />
        {r.pending > 0 && <p className="mt-1 text-xs text-sky-700">+ {num(r.pending)} w otwartych zadaniach</p>}
      </div>

      <div className="lg:col-span-4">
        <Badge tone={s.tone} className="mb-1.5">{s.icon}{s.label}</Badge>
        {r.status === 'REQUIRED' && (
          <div className="space-y-1">
            <p className="text-sm">Dołóż <strong className="tabular">{num(r.needed)} {unit}</strong>{r.product.unitsPerCarton ? <span className="text-slate-500"> (≈ {Math.ceil(r.needed / r.product.unitsPerCarton)} kart.)</span> : null}</p>
            {r.suggestions.map((sg, i) => (
              <p key={i} className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                <span className="font-mono font-medium text-slate-900">{sg.fromLocationCode}</span>
                {sg.handlingUnitCode && <span className="font-mono text-slate-400">…{sg.handlingUnitCode.slice(-8)}</span>}
                <ArrowRight className="size-3" />
                <span className="font-mono font-medium text-slate-900">{r.location.code}</span>
                <span>× {num(sg.quantity)}</span>
                {sg.expiryDate && <span className="text-slate-400">· ważne do {date(sg.expiryDate)}</span>}
              </p>
            ))}
            {r.suggestions.reduce((sum, sg) => sum + sg.quantity, 0) < r.needed && (
              <p className="text-xs text-amber-700">Rezerwa pokrywa tylko {num(r.reserveQty)} {unit} — uzupełnienie częściowe.</p>
            )}
          </div>
        )}
        {r.status === 'NO_RESERVE' && (
          <p className="text-sm text-red-700">
            Brak towaru w strefie składowania.{' '}
            <Link to={`/receipts/new?product=${r.product.id}&qty=${r.needed}`} className="font-medium underline">Zamów dostawę</Link>
          </p>
        )}
        {r.status === 'IN_PROGRESS' && <p className="text-xs text-slate-500">{r.openTasks.map((t) => `${t.number} (${num(t.quantity)})`).join(', ')}</p>}
        {r.status === 'OK' && <p className="text-xs text-slate-500">W rezerwie: {num(r.reserveQty)} {unit}</p>}
      </div>

      <div className="flex justify-end lg:col-span-2">
        {canOperate && r.status === 'REQUIRED' && (
          <Button size="sm" icon={<ClipboardCheck className="size-3.5" />} onClick={onGenerate} disabled={busy}>Utwórz zadanie</Button>
        )}
      </div>
    </li>
  );
}

function TaskList({ status, canOperate }: { status: TaskStatus; canOperate: boolean }) {
  const [executing, setExecuting] = useState<ReplenishmentTask | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['replenishment', 'tasks', status], queryFn: () => api.get<ReplenishmentTask[]>('/replenishment/tasks', { status }) });
  const cancel = useMutate((id: string) => api.post(`/replenishment/tasks/${id}/cancel`), { invalidate: INVALIDATE, success: 'Anulowano zadanie' });
  return (
    <>
      <DataTable
        loading={isLoading}
        rows={data}
        rowKey={(t) => t.id}
        empty={status === 'OPEN' ? 'Brak otwartych zadań' : 'Brak historii'}
        columns={[
          { key: 'num', header: 'Zadanie', cell: (t) => <div><p className="font-medium">{t.number}</p><p className="text-xs text-slate-500">{status === 'OPEN' ? relative(t.createdAt) : dateTime(t.completedAt)}</p></div> },
          { key: 'prio', header: 'Priorytet', cell: (t) => <PriorityBadge priority={t.priority} /> },
          { key: 'product', header: 'Produkt', cell: (t) => <div><span className="font-mono text-xs text-slate-500">{t.product.sku}</span><p className="max-w-60 truncate">{t.product.name}</p></div> },
          {
            key: 'route',
            header: 'Trasa',
            cell: (t) => (
              <span className="inline-flex items-center gap-1.5 font-mono text-xs whitespace-nowrap">
                <span className="rounded bg-slate-100 px-1.5 py-0.5">{t.fromLocation.code}</span>
                <ArrowRight className="size-3 text-slate-400" />
                <span className="rounded bg-brand-50 px-1.5 py-0.5 text-brand-700">{t.toLocation.code}</span>
              </span>
            ),
          },
          { key: 'qty', header: 'Ilość', align: 'right', cell: (t) => <span className="font-semibold tabular">{num(t.quantity)} <span className="text-xs font-normal text-slate-400">{UNIT[t.product.unit]}</span></span> },
          { key: 'user', header: status === 'OPEN' ? 'Zlecił' : 'Wykonał', hideOnMobile: true, cell: (t) => <span className="text-xs">{status === 'OPEN' ? t.createdBy.name : t.completedBy?.name}</span> },
          {
            key: 'actions',
            header: '',
            align: 'right',
            cell: (t) =>
              canOperate && (
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" icon={<X className="size-3.5" />} onClick={() => cancel.mutate(t.id)} aria-label="Anuluj zadanie" />
                  <Button size="sm" variant="success" icon={<Play className="size-3.5" />} onClick={() => setExecuting(t)}>Wykonaj</Button>
                </div>
              ),
          },
        ]}
      />
      <ExecuteModal task={executing} onClose={() => setExecuting(null)} />
    </>
  );
}

function ExecuteModal({ task, onClose }: { task: ReplenishmentTask | null; onClose: () => void }) {
  const [qty, setQty] = useState('');
  const run = useMutate(() => api.post(`/replenishment/tasks/${task!.id}/complete`, { quantity: Number(qty) || undefined }), {
    invalidate: INVALIDATE,
    success: `Uzupełniono ${task?.toLocation.code}`,
    onSuccess: onClose,
  });
  if (!task) return null;
  return (
    <Modal open onClose={onClose} title={`Wykonanie ${task.number}`} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Anuluj</Button><Button variant="success" onClick={() => run.mutate()} loading={run.isPending}>Potwierdź przeniesienie</Button></>}>
      <div className="space-y-4">
        <div className="flex items-center justify-center gap-4 rounded-xl bg-slate-50 py-5">
          <div className="text-center"><p className="text-xs text-slate-500">Pobierz z</p><p className="font-mono text-lg font-semibold">{task.fromLocation.code}</p>{task.handlingUnit && <p className="font-mono text-[11px] text-slate-400">…{task.handlingUnit.code.slice(-8)}</p>}</div>
          <ArrowRight className="size-6 text-slate-400" />
          <div className="text-center"><p className="text-xs text-slate-500">Odłóż na</p><p className="font-mono text-lg font-semibold text-brand-700">{task.toLocation.code}</p></div>
        </div>
        <p className="text-sm"><span className="font-mono text-xs text-slate-500">{task.product.sku}</span> {task.product.name}</p>
        <Field label="Przeniesiona ilość" hint={`planowano ${num(task.quantity)} — zmień, jeśli przeniesiono inną ilość`}>
          <Input type="number" min={1} placeholder={String(task.quantity)} value={qty} onChange={(e) => setQty(e.target.value)} suffix={UNIT[task.product.unit]} />
        </Field>
      </div>
    </Modal>
  );
}
