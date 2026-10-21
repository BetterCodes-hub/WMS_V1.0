import { useQuery } from '@tanstack/react-query';
import { CheckCheck, FileText, Layers, MoveRight, PackagePlus, Plus, Printer, Receipt, Trash2, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { api, openFile } from '@/api/client';
import type { Location, Product, ReceiptDetail, ReceiptLine } from '@/api/types';
import { PageHeader } from '@/components/PageHeader';
import { LocationPicker, ProductPicker } from '@/components/Pickers';
import { ReceiptStatusBadge } from '@/components/StatusBadge';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, StatCard } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Field';
import { EmptyState, Notice, Progress, Spinner } from '@/components/ui/Feedback';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { DataTable } from '@/components/ui/Table';
import { useMutate } from '@/hooks/useMutate';
import { useAuth } from '@/lib/auth';
import { date, dateTime, fromGrosze, isoDate, money, num, pln, toGrosze, UNIT } from '@/lib/format';
import { RECEIPT_MODE } from '@/lib/labels';
import { ReceiveModal } from './ReceiveModal';

const INVALIDATE = [['receipt'], ['receipts'], ['dashboard'], ['accounting']];

export default function ReceiptDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [receiving, setReceiving] = useState<ReceiptLine | null>(null);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [addLine, setAddLine] = useState(false);
  const [putaway, setPutaway] = useState<ReceiptDetail['handlingUnits'][number] | null>(null);
  const [invoice, setInvoice] = useState(false);
  const { data: r } = useQuery({ queryKey: ['receipt', id], queryFn: () => api.get<ReceiptDetail>(`/receipts/${id}`) });

  const complete = useMutate(() => api.post(`/receipts/${id}/complete`), { invalidate: INVALIDATE, success: 'Przyjęcie zakończone', onSuccess: () => setConfirmComplete(false) });
  const cancel = useMutate(() => api.post(`/receipts/${id}/cancel`), { invalidate: INVALIDATE, success: 'Przyjęcie anulowane', onSuccess: () => setConfirmCancel(false) });
  const removeLine = useMutate((lineId: string) => api.delete(`/receipts/${id}/lines/${lineId}`), { invalidate: INVALIDATE, success: 'Usunięto pozycję' });

  if (!r) return <Spinner className="py-32" />;
  const open = r.status === 'DRAFT' || r.status === 'RECEIVING';
  const canOperate = can('MANAGER', 'OPERATOR');
  const progress = r.totals.expectedQty ? Math.round((r.totals.receivedQty / r.totals.expectedQty) * 100) : 0;
  const atDock = r.handlingUnits.filter((h) => h.status === 'ACTIVE' && h.location?.type === 'RECEIVING');
  const entries = r.lines.flatMap((l) => l.entries.map((e) => ({ ...e, product: l.product }))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <>
      <PageHeader
        back={{ to: '/receipts', label: 'Przyjęcia' }}
        title={r.number}
        badge={<ReceiptStatusBadge status={r.status} />}
        description={
          <>
            {r.supplier.name}
            {r.supplierDocNo && <> · dok. dostawcy {r.supplierDocNo}</>}
            {r.expectedDate && open && <> · dostawa {date(r.expectedDate)}</>}
            {r.completedAt && <> · zakończono {dateTime(r.completedAt)}</>}
          </>
        }
        actions={
          <>
            <Button variant="secondary" icon={<FileText className="size-4" />} onClick={() => openFile(`/receipts/${r.id}/pdf`).catch((e) => toast.error(e.message))}>PZ (PDF)</Button>
            {r.handlingUnits.length > 0 && (
              <Button variant="secondary" icon={<Printer className="size-4" />} onClick={() => openFile(`/receipts/${r.id}/labels`).catch((e) => toast.error(e.message))}>Etykiety</Button>
            )}
            {canOperate && r.status === 'DRAFT' && <Button variant="ghost" icon={<XCircle className="size-4" />} onClick={() => setConfirmCancel(true)}>Anuluj</Button>}
            {canOperate && r.status === 'RECEIVING' && <Button variant="success" icon={<CheckCheck className="size-4" />} onClick={() => setConfirmComplete(true)}>Zakończ przyjęcie</Button>}
            {can('MANAGER', 'ACCOUNTANT') && r.status === 'COMPLETED' && !r.purchaseInvoice && (
              <Button icon={<Receipt className="size-4" />} onClick={() => setInvoice(true)}>Zarejestruj fakturę zakupową</Button>
            )}
          </>
        }
      />

      {r.notes && <div className="mb-4"><Notice tone="info">{r.notes}</Notice></div>}
      {r.purchaseInvoice && (
        <div className="mb-4">
          <Notice tone="success">
            Rozliczono fakturą{' '}
            {can('MANAGER', 'ACCOUNTANT') ? <Link to={`/invoices/${r.purchaseInvoice.id}`} className="font-medium underline">{r.purchaseInvoice.number}</Link> : r.purchaseInvoice.number}
            {r.purchaseInvoice.externalNumber && <> (nr dostawcy {r.purchaseInvoice.externalNumber})</>} — netto {pln(r.purchaseInvoice.netTotal)}
            {r.purchaseInvoice.netTotal !== r.totals.receivedValue && <>, różnica względem PZ: <strong>{pln(r.purchaseInvoice.netTotal - r.totals.receivedValue)}</strong></>}
          </Notice>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Postęp przyjęcia</p>
          <p className="mt-1.5 text-2xl font-semibold tabular">{progress}%</p>
          <Progress value={progress} tone={progress > 100 ? 'amber' : progress === 100 ? 'green' : 'brand'} className="mt-2" />
          <p className="mt-1 text-xs text-slate-500 tabular">{num(r.totals.receivedQty)} / {num(r.totals.expectedQty)} jedn.</p>
        </div>
        <StatCard label="Wartość przyjęta (netto)" value={pln(r.totals.receivedValue)} hint={`awizacja ${pln(r.totals.expectedValue)}`} />
        <StatCard label="Jednostki logistyczne" value={r.handlingUnits.length} hint={atDock.length ? `${atDock.length} czeka na rozlokowanie` : 'wszystkie rozlokowane'} tone={atDock.length ? 'amber' : 'slate'} />
        {open ? (
          <StatCard
            label="Pozostało do przyjęcia"
            value={num(r.lines.reduce((s, l) => s + Math.max(0, l.expectedQty - l.receivedQty), 0))}
            hint={`${r.lines.filter((l) => l.receivedQty < l.expectedQty).length} z ${r.lines.length} pozycji niekompletnych`}
            tone="brand"
          />
        ) : (
          <StatCard label="Rozbieżności" value={r.totals.discrepancies} hint="pozycje z różnicą ilości" tone={r.totals.discrepancies ? 'red' : 'green'} />
        )}
      </div>

      <Card padded={false}>
        <CardHeader
          title="Pozycje"
          description={open ? 'Kliknij „Przyjmij”, aby zaksięgować towar na sztuki, palety lub paletę matczyną z kartonami' : undefined}
          actions={open && canOperate && <Button size="sm" variant="secondary" icon={<Plus className="size-3.5" />} onClick={() => setAddLine(true)}>Dodaj pozycję</Button>}
        />
        <DataTable
          rows={r.lines}
          rowKey={(l) => l.id}
          columns={[
            {
              key: 'product',
              header: 'Produkt',
              cell: (l) => (
                <div className="min-w-48">
                  <Link to={`/products/${l.productId}`} className="font-medium hover:text-brand-700">{l.product.name}</Link>
                  <p className="text-xs text-slate-500">
                    <span className="font-mono">{l.product.sku}</span>
                    {l.product.ean && ` · EAN ${l.product.ean}`}
                    {l.batch && ` · partia ${l.batch}`}
                    {l.expiryDate && ` · do ${date(l.expiryDate)}`}
                  </p>
                </div>
              ),
            },
            { key: 'expected', header: 'Awizo', align: 'right', cell: (l) => <span className="tabular">{num(l.expectedQty)}</span> },
            {
              key: 'received',
              header: 'Przyjęto',
              cell: (l) => (
                <div className="w-32">
                  <div className="flex justify-between text-sm">
                    <span className="font-semibold tabular">{num(l.receivedQty)}</span>
                    <span className="text-xs text-slate-400">{UNIT[l.product.unit]}</span>
                  </div>
                  <Progress value={(l.receivedQty / l.expectedQty) * 100} tone={l.receivedQty > l.expectedQty ? 'amber' : l.receivedQty === l.expectedQty ? 'green' : 'brand'} className="mt-1 h-1.5" />
                </div>
              ),
            },
            {
              key: 'diff',
              header: open ? 'Pozostało' : 'Różnica',
              align: 'right',
              cell: (l) =>
                l.difference === 0 ? (
                  <Badge tone="green">zgodne</Badge>
                ) : l.difference > 0 ? (
                  <Badge tone="amber">nadwyżka +{num(l.difference)}</Badge>
                ) : open ? (
                  <span className="text-slate-500 tabular">{num(-l.difference)}</span>
                ) : (
                  <Badge tone="red">brak {num(-l.difference)}</Badge>
                ),
            },
            { key: 'price', header: 'Cena', align: 'right', hideOnMobile: true, cell: (l) => <span className="tabular">{money(l.unitPrice)}</span> },
            { key: 'value', header: 'Wartość', align: 'right', hideOnMobile: true, cell: (l) => <span className="tabular">{money(l.value)}</span> },
            {
              key: 'actions',
              header: '',
              align: 'right',
              cell: (l) =>
                open && canOperate && (
                  <div className="flex justify-end gap-1">
                    {l.receivedQty === 0 && r.lines.length > 1 && (
                      <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => removeLine.mutate(l.id)} aria-label="Usuń" />
                    )}
                    <Button size="sm" icon={<PackagePlus className="size-3.5" />} onClick={() => setReceiving(l)}>Przyjmij</Button>
                  </div>
                ),
            },
          ]}
        />
      </Card>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card padded={false}>
          <CardHeader title="Palety i kartony z dostawy" description="Rozlokuj palety ze strefy przyjęć na miejsca składowania" icon={<Layers className="size-4" />} />
          {r.handlingUnits.length ? (
            <ul className="divide-y divide-slate-100">
              {r.handlingUnits.map((h) => (
                <li key={h.id} className="flex items-center gap-3 px-5 py-3">
                  <Link to={`/pallets/${h.id}`} className="min-w-0 flex-1 hover:text-brand-700">
                    <p className="font-mono text-sm">{h.code}</p>
                    <p className="text-xs text-slate-500">
                      {h.type === 'PALLET' ? (h._count.children ? `paleta matczyna · ${h._count.children} kartonów` : 'paleta') : 'karton'}
                    </p>
                  </Link>
                  {h.status === 'EMPTY' ? <Badge>pusta</Badge> : <span className="font-mono text-xs font-medium">{h.location?.code}</span>}
                  {canOperate && h.status === 'ACTIVE' && h.location?.type === 'RECEIVING' && (
                    <Button size="sm" variant="secondary" icon={<MoveRight className="size-3.5" />} onClick={() => setPutaway(h)}>Rozlokuj</Button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Brak jednostek logistycznych" description="Pojawią się po przyjęciu towaru na palety." />
          )}
        </Card>
        <Card padded={false}>
          <CardHeader title="Dziennik przyjęcia" description="Każda operacja z datą i operatorem" />
          {entries.length ? (
            <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
              {entries.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  <Badge tone={e.mode === 'PIECE' ? 'gray' : e.mode === 'PALLET' ? 'indigo' : 'violet'}>{RECEIPT_MODE[e.mode]}</Badge>
                  <div className="min-w-0 flex-1">
                    <p className="truncate"><span className="font-mono text-xs text-slate-500">{e.product.sku}</span> × <strong>{num(e.quantity)}</strong></p>
                    {e.handlingUnit && <p className="font-mono text-[11px] text-slate-400">{e.handlingUnit.code}</p>}
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    <p>{e.user.name}</p>
                    <p>{dateTime(e.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Jeszcze nic nie przyjęto" />
          )}
        </Card>
      </div>

      <ReceiveModal receipt={r} line={receiving} onClose={() => setReceiving(null)} />
      <AddLineModal open={addLine} onClose={() => setAddLine(false)} receiptId={r.id} />
      <PutawayModal hu={putaway} onClose={() => setPutaway(null)} />
      <PurchaseInvoiceModal open={invoice} onClose={() => setInvoice(false)} receipt={r} onDone={(invId) => navigate(`/invoices/${invId}`)} />
      <ConfirmDialog open={confirmComplete} onClose={() => setConfirmComplete(false)} onConfirm={() => complete.mutate()} loading={complete.isPending} title="Zakończyć przyjęcie?" tone="success" confirmLabel="Zakończ">
        Dokument PZ zostanie zamknięty — dalsze przyjęcia nie będą możliwe.
        {r.totals.discrepancies > 0 && <p className="mt-2 font-medium text-amber-700">Uwaga: {r.totals.discrepancies} poz. ma rozbieżność ilości względem awizacji.</p>}
        {r.lines.some((l) => l.receivedQty === 0) && <p className="mt-2">Pozycje bez przyjętego towaru zostaną usunięte z dokumentu.</p>}
      </ConfirmDialog>
      <ConfirmDialog open={confirmCancel} onClose={() => setConfirmCancel(false)} onConfirm={() => cancel.mutate()} loading={cancel.isPending} title="Anulować awizację?" tone="danger" confirmLabel="Anuluj przyjęcie">
        Dokument {r.number} otrzyma status „Anulowane”.
      </ConfirmDialog>
    </>
  );
}

function AddLineModal({ open, onClose, receiptId }: { open: boolean; onClose: () => void; receiptId: string }) {
  const [product, setProduct] = useState<Product | null>(null);
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const save = useMutate(
    () => api.post(`/receipts/${receiptId}/lines`, { productId: product!.id, expectedQty: Number(qty), unitPrice: price ? toGrosze(price) : undefined }),
    { invalidate: [['receipt', receiptId]], success: 'Dodano pozycję', onSuccess: () => { onClose(); setProduct(null); setQty(''); } },
  );
  return (
    <Modal open={open} onClose={onClose} title="Dodaj pozycję do przyjęcia" description="Np. towar dostarczony bez awizacji" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Anuluj</Button><Button onClick={() => save.mutate()} disabled={!product || !Number(qty)} loading={save.isPending}>Dodaj</Button></>}>
      <div className="space-y-4">
        <Field label="Produkt"><ProductPicker value={product} onChange={(p) => { setProduct(p); setPrice(fromGrosze(p.purchasePrice)); }} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ilość"><Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
          <Field label="Cena netto"><Input value={price} onChange={(e) => setPrice(e.target.value)} suffix="zł" /></Field>
        </div>
      </div>
    </Modal>
  );
}

function PutawayModal({ hu, onClose }: { hu: ReceiptDetail['handlingUnits'][number] | null; onClose: () => void }) {
  const [target, setTarget] = useState<Location | null>(null);
  const save = useMutate(() => api.post(`/handling-units/${hu!.id}/move`, { toLocationId: target!.id }), {
    invalidate: [['receipt'], ['handling-units'], ['inventory'], ['locations'], ['replenishment']],
    success: `Rozlokowano paletę na ${target?.code}`,
    onSuccess: () => { setTarget(null); onClose(); },
  });
  if (!hu) return null;
  return (
    <Modal open onClose={onClose} title="Rozlokowanie palety" description={<span className="font-mono">{hu.code}</span>} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Anuluj</Button><Button onClick={() => save.mutate()} disabled={!target} loading={save.isPending}>Rozlokuj</Button></>}>
      <Field label="Miejsce składowania" hint="Wolne lokalizacje są proponowane w pierwszej kolejności">
        <LocationPicker value={target} onChange={setTarget} types={['STORAGE', 'PICKING']} preferEmpty />
      </Field>
    </Modal>
  );
}

function PurchaseInvoiceModal({ open, onClose, receipt, onDone }: { open: boolean; onClose: () => void; receipt: ReceiptDetail; onDone: (id: string) => void }) {
  const [externalNumber, setExternalNumber] = useState(receipt.supplierDocNo ?? '');
  const [issueDate, setIssueDate] = useState(isoDate());
  const [dueDate, setDueDate] = useState('');
  const [prices, setPrices] = useState<Record<string, string>>({});
  const priceOf = (l: ReceiptLine) => (prices[l.id] !== undefined ? toGrosze(prices[l.id] || '0') : l.unitPrice);
  const net = receipt.lines.reduce((s, l) => s + l.receivedQty * priceOf(l), 0);
  const diff = net - receipt.totals.receivedValue;

  const save = useMutate(
    () =>
      api.post<{ id: string }>('/invoices/purchase', {
        receiptId: receipt.id,
        externalNumber,
        issueDate,
        dueDate: dueDate || undefined,
        prices: receipt.lines.filter((l) => priceOf(l) !== l.unitPrice).map((l) => ({ receiptLineId: l.id, unitNet: priceOf(l) })),
      }),
    { invalidate: [['receipt'], ['invoices'], ['accounting']], success: 'Zarejestrowano fakturę zakupową', onSuccess: (r) => onDone(r.id) },
  );

  return (
    <Modal open={open} onClose={onClose} title="Faktura zakupowa do PZ" description={`${receipt.number} · ${receipt.supplier.name}`} size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Anuluj</Button><Button onClick={() => save.mutate()} disabled={!externalNumber} loading={save.isPending}>Zarejestruj</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Numer faktury dostawcy" required><Input value={externalNumber} onChange={(e) => setExternalNumber(e.target.value)} /></Field>
          <Field label="Data wystawienia"><Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></Field>
          <Field label="Termin płatności" hint={`domyślnie ${receipt.supplier.paymentDays ?? 14} dni`}><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
        </div>
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr><th className="px-3 py-2 text-left">Produkt</th><th className="px-3 py-2 text-right">Ilość</th><th className="px-3 py-2 text-right">Cena PZ</th><th className="px-3 py-2 text-right">Cena z faktury</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {receipt.lines.map((l) => (
                <tr key={l.id}>
                  <td className="px-3 py-2"><span className="font-mono text-xs text-slate-500">{l.product.sku}</span> {l.product.name}</td>
                  <td className="px-3 py-2 text-right tabular">{num(l.receivedQty)}</td>
                  <td className="px-3 py-2 text-right tabular">{money(l.unitPrice)}</td>
                  <td className="w-32 px-3 py-1.5">
                    <Input value={prices[l.id] ?? fromGrosze(l.unitPrice)} onChange={(e) => setPrices({ ...prices, [l.id]: e.target.value })} className="h-8 text-right" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-between rounded-lg bg-slate-50 px-4 py-3 text-sm">
          <span>Wartość netto faktury: <strong>{pln(net)}</strong></span>
          <span className={diff ? 'font-medium text-amber-700' : 'text-emerald-700'}>{diff ? `Różnica względem PZ: ${pln(diff)}` : 'Zgodna z PZ'}</span>
        </div>
      </div>
    </Modal>
  );
}
