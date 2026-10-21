import { useQuery } from '@tanstack/react-query';
import { CheckCheck, FileText, Pencil, Receipt, RotateCcw, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { api, openFile } from '@/api/client';
import type { IssueDetail } from '@/api/types';
import { PageHeader } from '@/components/PageHeader';
import { IssueStatusBadge } from '@/components/StatusBadge';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, StatCard } from '@/components/ui/Card';
import { Notice, Spinner } from '@/components/ui/Feedback';
import { ConfirmDialog } from '@/components/ui/Modal';
import { DataTable } from '@/components/ui/Table';
import { useMutate } from '@/hooks/useMutate';
import { useAuth } from '@/lib/auth';
import { date, dateTime, money, num, pln, UNIT } from '@/lib/format';

const INVALIDATE = [['issue'], ['issues'], ['inventory'], ['dashboard'], ['accounting'], ['products'], ['alerts'], ['replenishment']];

export default function IssueDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [dialog, setDialog] = useState<'confirm' | 'cancel' | 'reverse' | null>(null);
  const { data: i } = useQuery({ queryKey: ['issue', id], queryFn: () => api.get<IssueDetail>(`/issues/${id}`) });
  const close = () => setDialog(null);
  const confirm = useMutate(() => api.post(`/issues/${id}/confirm`), { invalidate: INVALIDATE, success: 'Towar wydany — stany zaktualizowane', onSuccess: close });
  const cancel = useMutate(() => api.post(`/issues/${id}/cancel`), { invalidate: INVALIDATE, success: 'Anulowano szkic', onSuccess: close });
  const reverse = useMutate(() => api.post(`/issues/${id}/reverse`), { invalidate: INVALIDATE, success: 'Wykonano storno — towar wrócił na stan', onSuccess: close });
  const invoice = useMutate(() => api.post<{ id: string; number: string }>('/invoices/from-issues', { issueIds: [id] }), {
    invalidate: INVALIDATE,
    success: (r) => `Wystawiono ${r.number}`,
    onSuccess: (r) => navigate(`/invoices/${r.id}`),
  });

  if (!i) return <Spinner className="py-32" />;
  const canOperate = can('MANAGER', 'OPERATOR');
  const margin = i.totals.net - i.totals.cost;
  const shortages = i.lines.filter((l) => l.available !== null && l.available < l.quantity);

  return (
    <>
      <PageHeader
        back={{ to: '/issues', label: 'Wydania' }}
        title={i.number}
        badge={<IssueStatusBadge status={i.status} />}
        description={<>{i.customer.name} · {date(i.issueDate)} · wystawił {i.createdBy.name}{i.confirmedAt && <> · wydano {dateTime(i.confirmedAt)}</>}</>}
        actions={
          <>
            <Button variant="secondary" icon={<FileText className="size-4" />} onClick={() => openFile(`/issues/${i.id}/pdf`).catch((e) => toast.error(e.message))}>WZ (PDF)</Button>
            {canOperate && i.status === 'DRAFT' && (
              <>
                <Button variant="ghost" icon={<XCircle className="size-4" />} onClick={() => setDialog('cancel')}>Anuluj</Button>
                <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => navigate(`/issues/${i.id}/edit`)}>Edytuj</Button>
                <Button variant="success" icon={<CheckCheck className="size-4" />} onClick={() => setDialog('confirm')} disabled={!i.canConfirm}>Zatwierdź wydanie</Button>
              </>
            )}
            {can('MANAGER') && i.status === 'CONFIRMED' && !i.invoice && (
              <Button variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => setDialog('reverse')}>Storno</Button>
            )}
            {can('MANAGER', 'ACCOUNTANT') && i.status === 'CONFIRMED' && !i.invoice && (
              <Button icon={<Receipt className="size-4" />} onClick={() => invoice.mutate()} loading={invoice.isPending}>Wystaw fakturę</Button>
            )}
          </>
        }
      />

      {shortages.length > 0 && (
        <div className="mb-4">
          <Notice tone="danger">
            Niewystarczający stan: {shortages.map((l) => `${l.product.sku} (potrzeba ${num(l.quantity)}, dostępne ${num(l.available)})`).join('; ')}. Zmień ilości lub poczekaj na dostawę.
          </Notice>
        </div>
      )}
      {i.invoice && (
        <div className="mb-4">
          <Notice tone="success">
            Zafakturowano:{' '}
            {can('MANAGER', 'ACCOUNTANT') ? <Link to={`/invoices/${i.invoice.id}`} className="font-medium underline">{i.invoice.number}</Link> : i.invoice.number}
          </Notice>
        </div>
      )}
      {i.notes && <div className="mb-4"><Notice tone="info">{i.notes}</Notice></div>}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Wartość netto" value={pln(i.totals.net)} hint={`brutto ${pln(i.totals.gross)}`} />
        <StatCard label="Koszt (cena ewidencyjna)" value={pln(i.totals.cost)} hint={i.status === 'DRAFT' ? 'wg bieżącego średniego kosztu' : 'w chwili wydania'} />
        <StatCard label="Marża" value={pln(margin)} hint={i.totals.net ? `${Math.round((margin / i.totals.net) * 100)}%` : undefined} tone={margin >= 0 ? 'green' : 'red'} />
        <StatCard label="Ilość" value={num(i.totals.quantity)} hint={`${i.lines.length} pozycji`} />
      </div>

      <Card padded={false}>
        <CardHeader title="Pozycje" description={i.status === 'CONFIRMED' ? 'Z informacją, skąd pobrano towar (FEFO)' : 'Dostępność sprawdzana na bieżąco'} />
        <DataTable
          rows={i.lines}
          rowKey={(l) => l.id}
          columns={[
            {
              key: 'p',
              header: 'Produkt',
              cell: (l) => (
                <div>
                  <Link to={`/products/${l.productId}`} className="font-medium hover:text-brand-700">{l.product.name}</Link>
                  <p className="font-mono text-xs text-slate-500">{l.product.sku}</p>
                  {l.allocations.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {l.allocations.map((a) => (
                        <Badge key={a.id} tone="gray" className="font-mono">
                          {a.locationCode}{a.handlingUnitCode && ` · …${a.handlingUnitCode.slice(-6)}`}{a.batch && ` · ${a.batch}`} × {num(a.quantity)}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ),
            },
            { key: 'q', header: 'Ilość', align: 'right', cell: (l) => <span className="font-medium tabular">{num(l.quantity)} <span className="text-xs font-normal text-slate-400">{UNIT[l.product.unit]}</span></span> },
            ...(i.status === 'DRAFT'
              ? [{ key: 'avail', header: 'Dostępne', align: 'right' as const, cell: (l: IssueDetail['lines'][number]) => <span className={`tabular ${(l.available ?? 0) < l.quantity ? 'font-semibold text-red-600' : 'text-emerald-600'}`}>{num(l.available)}</span> }]
              : []),
            { key: 'price', header: 'Cena netto', align: 'right', cell: (l) => <span className="tabular">{money(l.unitPrice)}</span> },
            { key: 'vat', header: 'VAT', align: 'right', hideOnMobile: true, cell: (l) => `${l.vatRate}%` },
            { key: 'net', header: 'Netto', align: 'right', cell: (l) => <span className="tabular">{money(l.net)}</span> },
            { key: 'gross', header: 'Brutto', align: 'right', hideOnMobile: true, cell: (l) => <span className="tabular">{money(l.gross)}</span> },
            { key: 'cost', header: 'Koszt', align: 'right', hideOnMobile: true, cell: (l) => <span className="text-slate-500 tabular">{money(l.costValue)}</span> },
          ]}
        />
      </Card>

      <ConfirmDialog open={dialog === 'confirm'} onClose={close} onConfirm={() => confirm.mutate()} loading={confirm.isPending} title="Zatwierdzić wydanie?" tone="success" confirmLabel="Wydaj towar">
        Towar zostanie zdjęty ze stanu według FEFO — najpierw z miejsc kompletacji, następnie z rezerwy. Operacji nie można edytować — tylko stornować.
      </ConfirmDialog>
      <ConfirmDialog open={dialog === 'cancel'} onClose={close} onConfirm={() => cancel.mutate()} loading={cancel.isPending} title="Anulować szkic?" tone="danger" confirmLabel="Anuluj WZ">
        Dokument otrzyma status „Anulowane”. Stany nie ulegną zmianie.
      </ConfirmDialog>
      <ConfirmDialog open={dialog === 'reverse'} onClose={close} onConfirm={() => reverse.mutate()} loading={reverse.isPending} title="Stornować wydanie?" tone="danger" confirmLabel="Wykonaj storno">
        Towar wróci do lokalizacji (i na palety), z których został pobrany. Dokument otrzyma status „Anulowane”.
      </ConfirmDialog>
    </>
  );
}
