import { useQuery } from '@tanstack/react-query';
import { Box, ChevronDown, ChevronRight, Layers, Link2, Move, Printer, Unlink } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { api, openFile } from '@/api/client';
import type { HandlingUnitDetail, HandlingUnitListItem, HuNode, Location, Paginated } from '@/api/types';
import { MovementsTable } from '@/pages/inventory/MovementsTable';
import { PageHeader } from '@/components/PageHeader';
import { LocationPicker } from '@/components/Pickers';
import { LocationTypeBadge } from '@/components/StatusBadge';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, StatCard } from '@/components/ui/Card';
import { Field, Select } from '@/components/ui/Field';
import { Notice, Spinner } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { DataTable } from '@/components/ui/Table';
import { useMutate } from '@/hooks/useMutate';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/cn';
import { date, num, UNIT } from '@/lib/format';
import { toast } from 'sonner';

const INVALIDATE = [['handling-unit'], ['handling-units'], ['inventory'], ['locations'], ['location'], ['receipt'], ['product']];

function TreeNode({ node, depth, rootId, canEdit }: { node: HuNode; depth: number; rootId: string; canEdit: boolean }) {
  const [open, setOpen] = useState(depth < 1);
  const detach = useMutate(() => api.post(`/handling-units/${node.id}/detach`), { invalidate: INVALIDATE, success: 'Odłączono od palety matczynej' });
  const hasChildren = node.children.length > 0;
  return (
    <li>
      <div className={cn('flex items-start gap-3 rounded-lg px-3 py-2.5', depth === 0 ? 'bg-brand-50/60' : 'hover:bg-slate-50')} style={{ marginLeft: depth * 24 }}>
        <button
          onClick={() => setOpen(!open)}
          className={cn('mt-0.5 rounded p-0.5 text-slate-400 hover:bg-slate-200', !hasChildren && 'invisible')}
        >
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
        <div className={cn('mt-0.5 rounded-md p-1.5', node.type === 'PALLET' ? 'bg-brand-100 text-brand-700' : 'bg-amber-100 text-amber-700')}>
          {node.type === 'PALLET' ? <Layers className="size-4" /> : <Box className="size-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {node.id === rootId ? (
              <span className="font-mono text-sm font-medium">{node.code}</span>
            ) : (
              <Link to={`/pallets/${node.id}`} className="font-mono text-sm font-medium hover:text-brand-700">{node.code}</Link>
            )}
            <Badge tone={node.type === 'PALLET' ? 'indigo' : 'amber'}>{node.type === 'PALLET' ? (hasChildren ? 'paleta matczyna' : 'paleta') : 'karton'}</Badge>
            {node.status === 'EMPTY' && <Badge>pusta</Badge>}
          </div>
          {node.stock.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
              {node.stock.map((s) => (
                <li key={s.id}>
                  <span className="font-mono text-slate-500">{s.product.sku}</span> {s.product.name} — <strong>{num(s.quantity)}</strong> {UNIT[s.product.unit]}
                  {s.batch && <span className="text-slate-400"> · partia {s.batch}</span>}
                  {s.expiryDate && <span className="text-slate-400"> · do {date(s.expiryDate)}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold tabular">{num(node.totalQty)}</p>
          {hasChildren && <p className="text-[11px] text-slate-500">{node.children.length} jedn. podrz.</p>}
        </div>
        {canEdit && depth === 1 && (
          <button onClick={() => detach.mutate()} title="Odłącz od palety matczynej" className="mt-0.5 rounded p-1 text-slate-400 hover:bg-white hover:text-slate-700">
            <Unlink className="size-4" />
          </button>
        )}
      </div>
      {open && hasChildren && (
        <ul className="mt-1 space-y-1">
          {node.children.map((c) => <TreeNode key={c.id} node={c} depth={depth + 1} rootId={rootId} canEdit={canEdit} />)}
        </ul>
      )}
    </li>
  );
}

export default function PalletDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const canEdit = can('MANAGER', 'OPERATOR');
  const [move, setMove] = useState(false);
  const [attach, setAttach] = useState(false);
  const { data: hu } = useQuery({ queryKey: ['handling-unit', id], queryFn: () => api.get<HandlingUnitDetail>(`/handling-units/${id}`) });
  if (!hu) return <Spinner className="py-32" />;
  const isMother = hu.tree.children.length > 0;

  return (
    <>
      <PageHeader
        back={{ to: '/pallets', label: 'Palety i kartony' }}
        title={<span className="font-mono">{hu.code}</span>}
        badge={<Badge tone={hu.type === 'PALLET' ? 'indigo' : 'amber'}>{hu.type === 'PALLET' ? (isMother ? 'Paleta matczyna' : 'Paleta') : 'Karton'}</Badge>}
        description={
          <>
            {hu.receipt && <>Przyjęcie <Link to={`/receipts/${hu.receipt.id}`} className="font-medium text-brand-600 hover:underline">{hu.receipt.number}</Link> · {hu.receipt.supplier.name} · </>}
            utworzono {date(hu.createdAt)}
          </>
        }
        actions={
          <>
            <Button variant="secondary" icon={<Printer className="size-4" />} onClick={() => openFile(`/handling-units/${hu.id}/label`).catch((e) => toast.error(e.message))}>Etykieta</Button>
            {canEdit && hu.status === 'ACTIVE' && !hu.parent && hu.type === 'CARTON' && (
              <Button variant="secondary" icon={<Link2 className="size-4" />} onClick={() => setAttach(true)}>Dołącz do palety</Button>
            )}
            {canEdit && hu.status === 'ACTIVE' && <Button icon={<Move className="size-4" />} onClick={() => setMove(true)}>Przenieś</Button>}
          </>
        }
      />

      {hu.parent && (
        <div className="mb-4">
          <Notice tone="info">
            Jednostka znajduje się na palecie matczynej{' '}
            <Link to={`/pallets/${hu.parent.id}`} className="font-mono font-medium underline">{hu.parent.code}</Link>. Przeniesienie jej osobno odłączy ją od palety.
          </Notice>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Lokalizacja" value={<span className="font-mono text-xl">{hu.location?.code ?? '—'}</span>} hint={hu.location && <LocationTypeBadge type={hu.location.type} />} />
        <StatCard label="Sztuk łącznie" value={num(hu.totalQty)} hint="z jednostkami podrzędnymi" tone="brand" />
        <StatCard label="Kartony na palecie" value={hu.cartonCount} />
        <StatCard label="Produkty (SKU)" value={hu.summary.length} />
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <Card padded={false} className="xl:col-span-3">
          <CardHeader title="Struktura jednostki" description="Paleta matczyna → kartony → zawartość" />
          <ul className="space-y-1 p-3">
            <TreeNode node={hu.tree} depth={0} rootId={hu.id} canEdit={canEdit} />
          </ul>
        </Card>
        <Card padded={false} className="xl:col-span-2">
          <CardHeader title="Podsumowanie zawartości" />
          <DataTable
            rows={hu.summary}
            rowKey={(s) => s.product.id}
            empty="Jednostka jest pusta"
            columns={[
              { key: 'p', header: 'Produkt', cell: (s) => <Link to={`/products/${s.product.id}`} className="hover:text-brand-700"><span className="font-mono text-xs text-slate-500">{s.product.sku}</span><p className="text-sm">{s.product.name}</p></Link> },
              { key: 'u', header: 'Jedn.', align: 'right', cell: (s) => s.units },
              { key: 'q', header: 'Ilość', align: 'right', cell: (s) => <span className="font-semibold tabular">{num(s.quantity)}</span> },
            ]}
          />
        </Card>
      </div>

      <Card padded={false} className="mt-6">
        <CardHeader title="Historia jednostki" />
        <MovementsTable rows={hu.history} />
      </Card>

      <MoveModal open={move} onClose={() => setMove(false)} hu={hu} />
      <AttachModal open={attach} onClose={() => setAttach(false)} hu={hu} />
    </>
  );
}

function MoveModal({ open, onClose, hu }: { open: boolean; onClose: () => void; hu: HandlingUnitDetail }) {
  const [target, setTarget] = useState<Location | null>(null);
  const save = useMutate(() => api.post<{ type: string }>(`/handling-units/${hu.id}/move`, { toLocationId: target!.id }), {
    invalidate: INVALIDATE,
    success: (r) => (r.type === 'PUTAWAY' ? `Rozlokowano na ${target?.code}` : `Przeniesiono na ${target?.code}`),
    onSuccess: onClose,
  });
  return (
    <Modal open={open} onClose={onClose} title="Przeniesienie jednostki" description={`Zostanie przeniesiona cała zawartość${hu.cartonCount ? ` wraz z ${hu.cartonCount} kartonami` : ''}.`} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Anuluj</Button><Button onClick={() => save.mutate()} disabled={!target} loading={save.isPending}>Przenieś</Button></>}>
      <Field label="Lokalizacja docelowa" hint="Wolne miejsca składowania wyświetlane są jako pierwsze">
        <LocationPicker value={target} onChange={setTarget} preferEmpty exclude={hu.location ? [hu.location.id] : []} types={['STORAGE', 'PICKING', 'SHIPPING', 'QUARANTINE', 'RECEIVING']} />
      </Field>
    </Modal>
  );
}

function AttachModal({ open, onClose, hu }: { open: boolean; onClose: () => void; hu: HandlingUnitDetail }) {
  const [parent, setParent] = useState('');
  const { data } = useQuery({
    enabled: open && !!hu.location,
    queryKey: ['handling-units', 'at', hu.location?.id],
    queryFn: () => api.get<Paginated<HandlingUnitListItem>>('/handling-units', { locationId: hu.location!.id, type: 'PALLET', pageSize: 100 }),
  });
  const save = useMutate(() => api.post(`/handling-units/${hu.id}/attach`, { parentId: parent }), { invalidate: INVALIDATE, success: 'Dołączono do palety', onSuccess: onClose });
  return (
    <Modal open={open} onClose={onClose} title="Dołącz do palety matczynej" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Anuluj</Button><Button onClick={() => save.mutate()} disabled={!parent} loading={save.isPending}>Dołącz</Button></>}>
      <Field label={`Palety w lokalizacji ${hu.location?.code ?? ''}`}>
        <Select value={parent} onChange={(e) => setParent(e.target.value)}>
          <option value="">— wybierz —</option>
          {data?.items.filter((p) => p.id !== hu.id).map((p) => <option key={p.id} value={p.id}>{p.code} ({num(p.totalQty)} szt.)</option>)}
        </Select>
      </Field>
    </Modal>
  );
}
