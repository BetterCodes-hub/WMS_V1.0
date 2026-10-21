import { useQuery } from '@tanstack/react-query';
import { Download, FileSpreadsheet, Receipt, Scale, TrendingUp, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { api, openFile } from '@/api/client';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, StatCard } from '@/components/ui/Card';
import { Input } from '@/components/ui/Field';
import { EmptyState, Spinner } from '@/components/ui/Feedback';
import { date, isoDate, money, pln } from '@/lib/format';

interface VatRow { vatRate: number; net: number; vat: number; gross: number }
interface Side { count: number; net: number; vat: number; gross: number; byRate: VatRow[] }
interface Summary {
  period: { from: string; to: string };
  sales: Side;
  purchases: Side;
  vatDue: number;
  goodsIssues: { net: number; cost: number; margin: number; marginPercent: number };
  goodsReceiptsValue: number;
  receivables: { total: number; overdue: number };
  payables: { total: number; overdue: number };
}
interface Pending {
  issues: { id: string; number: string; issueDate: string; customer: { id: string; name: string }; netValue: number }[];
  receipts: { id: string; number: string; completedAt: string; supplier: { name: string }; value: number }[];
}

const firstOfMonth = () => {
  const d = new Date();
  return isoDate(new Date(d.getFullYear(), d.getMonth(), 1));
};

function VatTable({ title, side }: { title: string; side: Side }) {
  return (
    <Card padded={false}>
      <CardHeader title={title} description={`${side.count} faktur`} />
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs text-slate-500">
          <tr><th className="px-5 py-2 text-left">Stawka</th><th className="px-5 py-2 text-right">Netto</th><th className="px-5 py-2 text-right">VAT</th><th className="px-5 py-2 text-right">Brutto</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {side.byRate.length ? side.byRate.map((r) => (
            <tr key={r.vatRate}><td className="px-5 py-2">{r.vatRate}%</td><td className="px-5 py-2 text-right tabular">{money(r.net)}</td><td className="px-5 py-2 text-right tabular">{money(r.vat)}</td><td className="px-5 py-2 text-right tabular">{money(r.gross)}</td></tr>
          )) : <tr><td colSpan={4} className="px-5 py-6 text-center text-slate-400">brak faktur w okresie</td></tr>}
        </tbody>
        <tfoot>
          <tr className="border-t border-slate-200 font-semibold"><td className="px-5 py-2">Razem</td><td className="px-5 py-2 text-right tabular">{money(side.net)}</td><td className="px-5 py-2 text-right tabular">{money(side.vat)}</td><td className="px-5 py-2 text-right tabular">{money(side.gross)}</td></tr>
        </tfoot>
      </table>
    </Card>
  );
}

export default function AccountingPage() {
  const navigate = useNavigate();
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(isoDate());
  const { data: s } = useQuery({ queryKey: ['accounting', 'summary', from, to], queryFn: () => api.get<Summary>('/accounting/summary', { from, to }) });
  const { data: pending } = useQuery({ queryKey: ['accounting', 'pending'], queryFn: () => api.get<Pending>('/accounting/pending') });
  const download = (path: string, name: string, type?: string) => openFile(path, { from, to, type }, name).catch((e) => toast.error(e.message));

  const byCustomer = new Map<string, Pending['issues']>();
  pending?.issues.forEach((i) => byCustomer.set(i.customer.id, [...(byCustomer.get(i.customer.id) ?? []), i]));

  return (
    <>
      <PageHeader
        title="Rozliczenia"
        description="Zestawienia dla księgowości: VAT należny i naliczony, marża na wydaniach, należności, dokumenty do rozliczenia"
        actions={
          <>
            <Button variant="secondary" icon={<FileSpreadsheet className="size-4" />} onClick={() => download('/accounting/export/invoices', `rejestr-vat-${from}_${to}.csv`)}>Rejestr VAT (CSV)</Button>
            <Button variant="secondary" icon={<Download className="size-4" />} onClick={() => download('/accounting/export/documents', `dokumenty-PZ-WZ-${from}_${to}.csv`)}>PZ / WZ (CSV)</Button>
          </>
        }
      />
      <div className="mb-6 flex flex-wrap items-center gap-2 text-sm text-slate-600">
        Okres:
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-auto" />–
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-auto" />
      </div>

      {!s ? (
        <Spinner className="py-20" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <StatCard label="Sprzedaż netto" value={pln(s.sales.net)} hint={`${s.sales.count} faktur`} icon={<TrendingUp className="size-4" />} tone="brand" />
            <StatCard label="Zakupy netto" value={pln(s.purchases.net)} hint={`${s.purchases.count} faktur`} icon={<Receipt className="size-4" />} />
            <StatCard label={s.vatDue >= 0 ? 'VAT do zapłaty' : 'VAT do zwrotu / przeniesienia'} value={pln(Math.abs(s.vatDue))} hint={`należny ${money(s.sales.vat)} − naliczony ${money(s.purchases.vat)}`} icon={<Scale className="size-4" />} tone={s.vatDue >= 0 ? 'amber' : 'green'} />
            <StatCard label="Marża na WZ" value={pln(s.goodsIssues.margin)} hint={`${s.goodsIssues.marginPercent}% · koszt ${money(s.goodsIssues.cost)}`} tone="green" />
            <StatCard label="Należności" value={pln(s.receivables.total)} hint={s.receivables.overdue ? `${pln(s.receivables.overdue)} po terminie` : 'brak przeterminowanych'} icon={<Wallet className="size-4" />} tone={s.receivables.overdue ? 'red' : 'slate'} onClick={() => navigate('/invoices')} />
            <StatCard label="Zobowiązania" value={pln(s.payables.total)} hint={s.payables.overdue ? `${pln(s.payables.overdue)} po terminie` : undefined} tone={s.payables.overdue ? 'red' : 'slate'} />
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <VatTable title="VAT należny (sprzedaż)" side={s.sales} />
            <VatTable title="VAT naliczony (zakupy)" side={s.purchases} />
          </div>
        </>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card padded={false}>
          <CardHeader title="WZ do zafakturowania" description="Wydania bez faktury sprzedaży, pogrupowane wg odbiorcy" />
          {byCustomer.size ? (
            <ul className="divide-y divide-slate-100">
              {[...byCustomer.values()].map((list) => (
                <li key={list[0].customer.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{list[0].customer.name}</p>
                    <p className="truncate text-xs text-slate-500">{list.map((i) => i.number).join(', ')}</p>
                  </div>
                  <span className="text-sm font-medium tabular">{money(list.reduce((sum, i) => sum + i.netValue, 0))} zł</span>
                  <Button size="sm" onClick={() => navigate(`/invoices/new?issues=${list.map((i) => i.id).join(',')}`)}>Fakturuj</Button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Wszystkie wydania są zafakturowane" />
          )}
        </Card>
        <Card padded={false}>
          <CardHeader title="PZ bez faktury zakupowej" description="Przyjęcia oczekujące na fakturę od dostawcy" />
          {pending?.receipts.length ? (
            <ul className="divide-y divide-slate-100">
              {pending.receipts.map((r) => (
                <li key={r.id}>
                  <Link to={`/receipts/${r.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{r.number}</p>
                      <p className="text-xs text-slate-500">{r.supplier.name} · {date(r.completedAt)}</p>
                    </div>
                    <span className="text-sm font-medium tabular">{money(r.value)} zł</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Wszystkie przyjęcia rozliczone" />
          )}
        </Card>
      </div>
    </>
  );
}
