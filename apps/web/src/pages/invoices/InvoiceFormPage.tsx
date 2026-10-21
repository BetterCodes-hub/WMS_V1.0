import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { api } from '@/api/client';
import type { Contractor, IssueListItem, Paginated, PaymentMethod } from '@/api/types';
import { PageHeader } from '@/components/PageHeader';
import { ContractorPicker } from '@/components/Pickers';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/Feedback';
import { Segmented } from '@/components/ui/Tabs';
import { useMutate } from '@/hooks/useMutate';
import { date, isoDate, money, toGrosze } from '@/lib/format';
import { PAYMENT } from '@/lib/labels';

type Mode = 'issues' | 'manual';
interface ManualLine { key: number; name: string; unit: string; qty: string; price: string; vat: string }
let seq = 0;
const blank = (): ManualLine => ({ key: ++seq, name: '', unit: 'szt.', qty: '1', price: '', vat: '23' });

export default function InvoiceFormPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<Mode>('issues');
  const [selected, setSelected] = useState<string[]>(params.get('issues')?.split(',') ?? []);
  const [contractor, setContractor] = useState<Contractor | null>(null);
  const [issueDate, setIssueDate] = useState(isoDate());
  const [saleDate, setSaleDate] = useState(isoDate());
  const [dueDate, setDueDate] = useState('');
  const [payment, setPayment] = useState<PaymentMethod>('TRANSFER');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<ManualLine[]>([blank()]);

  const { data: issues } = useQuery({
    queryKey: ['issues', 'uninvoiced'],
    queryFn: () => api.get<Paginated<IssueListItem>>('/issues', { uninvoiced: true, pageSize: 200 }),
  });
  const chosen = useMemo(() => issues?.items.filter((i) => selected.includes(i.id)) ?? [], [issues, selected]);
  const customerId = chosen[0]?.customer.id;

  const toggle = (i: IssueListItem) =>
    setSelected((s) => (s.includes(i.id) ? s.filter((x) => x !== i.id) : customerId && customerId !== i.customer.id ? [i.id] : [...s, i.id]));

  const done = { invalidate: [['invoices'], ['issues'], ['accounting']], success: (r: { number: string }) => `Wystawiono ${r.number}`, onSuccess: (r: { id: string }) => navigate(`/invoices/${r.id}`) };
  const fromIssues = useMutate(
    () => api.post<{ id: string; number: string }>('/invoices/from-issues', { issueIds: selected, issueDate, saleDate: saleDate || undefined, dueDate: dueDate || undefined, paymentMethod: payment, notes: notes || undefined }),
    done,
  );
  const manual = useMutate(
    () =>
      api.post<{ id: string; number: string }>('/invoices/manual', {
        contractorId: contractor!.id, issueDate, saleDate, dueDate: dueDate || undefined, paymentMethod: payment, notes: notes || undefined,
        lines: lines.map((l) => ({ name: l.name, unit: l.unit, quantity: Number(l.qty), unitNet: toGrosze(l.price || '0'), vatRate: Number(l.vat) })),
      }),
    done,
  );

  const update = (key: number, patch: Partial<ManualLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const manualNet = lines.reduce((s, l) => s + Number(l.qty || 0) * toGrosze(l.price || '0'), 0);
  const canSubmit = mode === 'issues' ? selected.length > 0 : !!contractor && lines.every((l) => l.name.length >= 2 && Number(l.qty) > 0);

  return (
    <>
      <PageHeader
        back={{ to: '/invoices', label: 'Faktury' }}
        title="Nowa faktura sprzedaży"
        actions={<Button onClick={() => (mode === 'issues' ? fromIssues.mutate() : manual.mutate())} disabled={!canSubmit} loading={fromIssues.isPending || manual.isPending}>Wystaw fakturę</Button>}
      />
      <div className="mb-4">
        <Segmented value={mode} onChange={setMode} options={[{ value: 'issues', label: 'Do dokumentów WZ' }, { value: 'manual', label: 'Ręczna (usługi)' }]} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="space-y-4">
          {mode === 'manual' && <Field label="Nabywca" required><ContractorPicker value={contractor} onChange={setContractor} type="CUSTOMER" /></Field>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Data wystawienia"><Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></Field>
            <Field label="Data sprzedaży" hint={mode === 'issues' ? 'domyślnie data ostatniego WZ' : undefined}><Input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Termin płatności" hint="puste = wg kontrahenta"><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
            <Field label="Forma płatności">
              <Select value={payment} onChange={(e) => setPayment(e.target.value as PaymentMethod)}>
                {Object.entries(PAYMENT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Uwagi"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={mode === 'issues' ? 'domyślnie: lista numerów WZ' : ''} /></Field>
        </Card>

        {mode === 'issues' ? (
          <Card padded={false} className="lg:col-span-2">
            <CardHeader
              title="Dokumenty WZ do zafakturowania"
              description={chosen.length ? `${chosen[0].customer.name} · ${chosen.length} dok. · ${money(chosen.reduce((s, i) => s + i.netValue, 0))} zł netto` : 'Zaznacz dokumenty jednego odbiorcy — pozycje zostaną zsumowane'}
            />
            {issues?.items.length ? (
              <ul className="divide-y divide-slate-100">
                {issues.items.map((i) => {
                  const disabled = !!customerId && customerId !== i.customer.id;
                  return (
                    <li key={i.id}>
                      <label className={`flex cursor-pointer items-center gap-3 px-5 py-3 hover:bg-slate-50 ${disabled ? 'opacity-40' : ''}`}>
                        <input type="checkbox" checked={selected.includes(i.id)} onChange={() => toggle(i)} className="size-4 rounded border-slate-300 text-brand-600" />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{i.number}</p>
                          <p className="text-xs text-slate-500">{i.customer.name} · {date(i.issueDate)} · {i.lineCount} poz.</p>
                        </div>
                        <span className="font-medium tabular">{money(i.netValue)} zł</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState title="Wszystkie wydania są zafakturowane" />
            )}
          </Card>
        ) : (
          <Card padded={false} className="lg:col-span-2">
            <CardHeader title="Pozycje" description={`netto ${money(manualNet)} zł`} actions={<Button size="sm" variant="secondary" icon={<Plus className="size-3.5" />} onClick={() => setLines((l) => [...l, blank()])}>Dodaj</Button>} />
            <div className="divide-y divide-slate-100">
              {lines.map((l) => (
                <div key={l.key} className="grid gap-3 p-4 sm:grid-cols-12">
                  <div className="sm:col-span-5"><Field label="Nazwa"><Input value={l.name} onChange={(e) => update(l.key, { name: e.target.value })} placeholder="np. Usługa magazynowania" /></Field></div>
                  <div className="sm:col-span-1"><Field label="J.m."><Input value={l.unit} onChange={(e) => update(l.key, { unit: e.target.value })} /></Field></div>
                  <div className="sm:col-span-2"><Field label="Ilość"><Input type="number" min={1} value={l.qty} onChange={(e) => update(l.key, { qty: e.target.value })} /></Field></div>
                  <div className="sm:col-span-2"><Field label="Cena netto"><Input value={l.price} onChange={(e) => update(l.key, { price: e.target.value })} /></Field></div>
                  <div className="sm:col-span-1"><Field label="VAT"><Select value={l.vat} onChange={(e) => update(l.key, { vat: e.target.value })}>{['23', '8', '5', '0'].map((v) => <option key={v} value={v}>{v}%</option>)}</Select></Field></div>
                  <div className="flex items-end sm:col-span-1">{lines.length > 1 && <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" />} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label="Usuń" />}</div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
