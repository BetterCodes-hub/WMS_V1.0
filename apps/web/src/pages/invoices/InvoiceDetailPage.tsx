import { useQuery } from '@tanstack/react-query';
import { Ban, CheckCircle2, FileDown, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { api, openFile } from '@/api/client';
import type { Company, InvoiceDetail } from '@/api/types';
import { PageHeader } from '@/components/PageHeader';
import { InvoiceStatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Field';
import { Notice, Spinner } from '@/components/ui/Feedback';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { useMutate } from '@/hooks/useMutate';
import { date, isoDate, money, pln } from '@/lib/format';
import { PAYMENT } from '@/lib/labels';

const INVALIDATE = [['invoice'], ['invoices'], ['accounting'], ['issues'], ['issue'], ['receipt'], ['receipts']];

type PartyData = Pick<Company, 'name'> & { street?: string | null; postalCode?: string | null; city?: string | null; nip?: string | null };

function Party({ label, p }: { label: string; p: PartyData }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">{label}</p>
      <p className="font-semibold">{p.name}</p>
      {p.street && <p className="text-sm text-slate-600">{p.street}</p>}
      {(p.postalCode || p.city) && <p className="text-sm text-slate-600">{p.postalCode} {p.city}</p>}
      {p.nip && <p className="text-sm text-slate-600">NIP: {p.nip}</p>}
    </div>
  );
}

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const [pay, setPay] = useState(false);
  const [cancelDlg, setCancelDlg] = useState(false);
  const [paidAt, setPaidAt] = useState(isoDate());
  const { data: inv } = useQuery({ queryKey: ['invoice', id], queryFn: () => api.get<InvoiceDetail>(`/invoices/${id}`) });
  const { data: company } = useQuery({ queryKey: ['settings', 'company'], queryFn: () => api.get<Company>('/settings/company') });
  const markPaid = useMutate(() => api.post(`/invoices/${id}/paid`, { paidAt }), { invalidate: INVALIDATE, success: 'Oznaczono jako opłaconą', onSuccess: () => setPay(false) });
  const markUnpaid = useMutate(() => api.post(`/invoices/${id}/unpaid`), { invalidate: INVALIDATE, success: 'Cofnięto płatność' });
  const cancel = useMutate(() => api.post(`/invoices/${id}/cancel`), { invalidate: INVALIDATE, success: 'Faktura anulowana', onSuccess: () => setCancelDlg(false) });

  if (!inv || !company) return <Spinner className="py-32" />;
  const sales = inv.type === 'SALES';
  const seller = sales ? company : inv.contractor;
  const buyer = sales ? inv.contractor : company;

  return (
    <>
      <PageHeader
        back={{ to: '/invoices', label: 'Faktury' }}
        title={inv.number}
        badge={<InvoiceStatusBadge status={inv.status} overdue={inv.overdue} />}
        description={sales ? 'Faktura VAT sprzedaży' : `Faktura zakupowa${inv.externalNumber ? ` · nr dostawcy ${inv.externalNumber}` : ''}`}
        actions={
          <>
            <Button variant="secondary" icon={<FileDown className="size-4" />} onClick={() => openFile(`/invoices/${inv.id}/pdf`).catch((e) => toast.error(e.message))}>PDF</Button>
            {inv.status === 'ISSUED' && <Button variant="ghost" icon={<Ban className="size-4" />} onClick={() => setCancelDlg(true)}>Anuluj</Button>}
            {inv.status === 'PAID' && <Button variant="ghost" icon={<Undo2 className="size-4" />} onClick={() => markUnpaid.mutate()}>Cofnij płatność</Button>}
            {inv.status === 'ISSUED' && <Button variant="success" icon={<CheckCircle2 className="size-4" />} onClick={() => setPay(true)}>Oznacz jako opłaconą</Button>}
          </>
        }
      />

      {inv.receiptDifference !== null && inv.receiptDifference !== 0 && (
        <div className="mb-4">
          <Notice tone="warning">
            Rozbieżność z dokumentem {inv.receipt && <Link to={`/receipts/${inv.receipt.id}`} className="font-medium underline">{inv.receipt.number}</Link>}: wartość PZ {pln(inv.receiptValue)}, faktura {pln(inv.netTotal)} — różnica <strong>{pln(inv.receiptDifference)}</strong> netto.
          </Notice>
        </div>
      )}

      <Card className="mx-auto max-w-4xl p-6 sm:p-10">
        <div className="flex flex-wrap justify-between gap-6 border-b border-slate-200 pb-6">
          <div>
            <p className="text-2xl font-semibold text-brand-700">{inv.status === 'CANCELLED' ? 'Faktura anulowana' : sales ? 'Faktura VAT' : 'Faktura zakupowa'}</p>
            <p className="mt-1 text-lg font-medium">{inv.number}</p>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <dt className="text-slate-500">Data wystawienia</dt><dd className="text-right font-medium">{date(inv.issueDate)}</dd>
            <dt className="text-slate-500">Data sprzedaży</dt><dd className="text-right font-medium">{date(inv.saleDate)}</dd>
            <dt className="text-slate-500">Termin płatności</dt><dd className={`text-right font-medium ${inv.overdue ? 'text-red-600' : ''}`}>{date(inv.dueDate)}</dd>
            <dt className="text-slate-500">Płatność</dt><dd className="text-right font-medium">{PAYMENT[inv.paymentMethod]}</dd>
          </dl>
        </div>
        <div className="grid gap-6 border-b border-slate-200 py-6 sm:grid-cols-2">
          <Party label="Sprzedawca" p={seller} />
          <Party label="Nabywca" p={buyer} />
        </div>
        <div className="overflow-x-auto py-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500">
                <th className="py-2 pr-2 text-left">Lp.</th><th className="py-2 text-left">Nazwa</th><th className="py-2 text-right">Ilość</th>
                <th className="py-2 text-right">Cena netto</th><th className="py-2 text-right">Netto</th><th className="py-2 text-right">VAT</th><th className="py-2 text-right">Brutto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {inv.lines.map((l, i) => (
                <tr key={l.id}>
                  <td className="py-2 pr-2 text-slate-400">{i + 1}</td>
                  <td className="py-2">{l.name}</td>
                  <td className="py-2 text-right whitespace-nowrap tabular">{l.quantity} {l.unit}</td>
                  <td className="py-2 text-right tabular">{money(l.unitNet)}</td>
                  <td className="py-2 text-right tabular">{money(l.net)}</td>
                  <td className="py-2 text-right whitespace-nowrap text-slate-500 tabular">{l.vatRate}% · {money(l.vat)}</td>
                  <td className="py-2 text-right font-medium tabular">{money(l.gross)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap justify-between gap-6">
          <div className="text-sm text-slate-600">
            {sales && company.bankAccount && <p>Konto: <span className="font-mono">{company.bankAccount}</span></p>}
            {inv.goodsIssues.length > 0 && <p className="mt-1">Dokumenty WZ: {inv.goodsIssues.map((g, i) => <span key={g.id}>{i > 0 && ', '}<Link to={`/issues/${g.id}`} className="text-brand-600 hover:underline">{g.number}</Link></span>)}</p>}
            {inv.receipt && <p className="mt-1">Dokument PZ: <Link to={`/receipts/${inv.receipt.id}`} className="text-brand-600 hover:underline">{inv.receipt.number}</Link></p>}
            {inv.notes && <p className="mt-1">Uwagi: {inv.notes}</p>}
            {inv.paidAt && <p className="mt-2 font-medium text-emerald-700">Zapłacono {date(inv.paidAt)}</p>}
          </div>
          <table className="text-sm">
            <thead><tr className="text-xs text-slate-500"><th className="pr-6 text-left">Stawka</th><th className="pr-6 text-right">Netto</th><th className="pr-6 text-right">VAT</th><th className="text-right">Brutto</th></tr></thead>
            <tbody>
              {inv.breakdown.map((b) => (
                <tr key={b.vatRate}><td className="pr-6">{b.vatRate}%</td><td className="pr-6 text-right tabular">{money(b.net)}</td><td className="pr-6 text-right tabular">{money(b.vat)}</td><td className="text-right tabular">{money(b.gross)}</td></tr>
              ))}
              <tr className="border-t border-slate-200 font-semibold"><td className="pt-1 pr-6">Razem</td><td className="pt-1 pr-6 text-right tabular">{money(inv.netTotal)}</td><td className="pt-1 pr-6 text-right tabular">{money(inv.vatTotal)}</td><td className="pt-1 text-right tabular">{money(inv.grossTotal)}</td></tr>
            </tbody>
          </table>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-brand-50 px-5 py-4">
          <div>
            <p className="text-xs font-semibold tracking-wider text-brand-700 uppercase">Do zapłaty</p>
            <p className="text-sm text-brand-900/70">słownie: {inv.amountInWords}</p>
          </div>
          <p className="text-2xl font-semibold text-brand-900 tabular">{pln(inv.grossTotal)}</p>
        </div>
      </Card>

      <Modal open={pay} onClose={() => setPay(false)} title="Rejestracja płatności" size="sm"
        footer={<><Button variant="secondary" onClick={() => setPay(false)}>Anuluj</Button><Button variant="success" onClick={() => markPaid.mutate()} loading={markPaid.isPending}>Zapisz</Button></>}>
        <Field label="Data zapłaty"><Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} /></Field>
      </Modal>
      <ConfirmDialog open={cancelDlg} onClose={() => setCancelDlg(false)} onConfirm={() => cancel.mutate()} loading={cancel.isPending} title="Anulować fakturę?" tone="danger" confirmLabel="Anuluj fakturę">
        Faktura pozostanie w rejestrze ze statusem „Anulowana”. Powiązane dokumenty {sales ? 'WZ' : 'PZ'} zostaną zwolnione do ponownego rozliczenia.
      </ConfirmDialog>
    </>
  );
}
