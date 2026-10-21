import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { api } from '@/api/client';
import type { Contractor, IssueDetail, Product } from '@/api/types';
import { PageHeader } from '@/components/PageHeader';
import { ContractorPicker, ProductPicker } from '@/components/Pickers';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Spinner } from '@/components/ui/Feedback';
import { useMutate } from '@/hooks/useMutate';
import { fromGrosze, isoDate, money, num, toGrosze, UNIT } from '@/lib/format';

interface Line {
  key: number;
  product: (Pick<Product, 'id' | 'sku' | 'name' | 'unit'> & { stock?: number }) | null;
  qty: string;
  price: string;
  vat: string;
}
let seq = 0;
const blank = (): Line => ({ key: ++seq, product: null, qty: '1', price: '', vat: '23' });

export default function IssueFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const editing = !!id;
  const [customer, setCustomer] = useState<Contractor | null>(null);
  const [issueDate, setIssueDate] = useState(isoDate());
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([blank()]);

  const { data: existing } = useQuery({ enabled: editing, queryKey: ['issue', id], queryFn: () => api.get<IssueDetail>(`/issues/${id}`) });
  useEffect(() => {
    if (!existing) return;
    setCustomer(existing.customer);
    setIssueDate(existing.issueDate.slice(0, 10));
    setNotes(existing.notes ?? '');
    setLines(existing.lines.map((l) => ({ key: ++seq, product: { ...l.product, stock: l.available ?? undefined }, qty: String(l.quantity), price: fromGrosze(l.unitPrice), vat: String(l.vatRate) })));
  }, [existing]);

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const save = useMutate(
    (body: object) => (editing ? api.put<{ id: string }>(`/issues/${id}`, body) : api.post<{ id: string }>('/issues', body)),
    { invalidate: [['issues'], ['issue']], success: editing ? 'Zapisano zmiany' : 'Utworzono WZ', onSuccess: (r) => navigate(`/issues/${r.id}`) },
  );

  const ids = lines.map((l) => l.product?.id).filter(Boolean);
  const duplicates = ids.length !== new Set(ids).size;
  const valid = customer && lines.every((l) => l.product && Number(l.qty) > 0) && !duplicates;
  const net = lines.reduce((s, l) => s + (Number(l.qty) || 0) * toGrosze(l.price || '0'), 0);
  const vat = lines.reduce((s, l) => s + Math.round(((Number(l.qty) || 0) * toGrosze(l.price || '0') * Number(l.vat)) / 100), 0);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate({
      customerId: customer!.id,
      issueDate,
      notes: notes || undefined,
      lines: lines.map((l) => ({ productId: l.product!.id, quantity: Number(l.qty), unitPrice: toGrosze(l.price || '0'), vatRate: Number(l.vat) })),
    });
  };

  if (editing && !existing) return <Spinner className="py-32" />;
  return (
    <form onSubmit={submit}>
      <PageHeader
        back={{ to: editing ? `/issues/${id}` : '/issues', label: editing ? existing!.number : 'Wydania' }}
        title={editing ? `Edycja ${existing!.number}` : 'Nowe wydanie (WZ)'}
        description="Szkic nie zmienia stanów — towar zostanie pobrany przy zatwierdzeniu dokumentu."
        actions={<Button type="submit" disabled={!valid} loading={save.isPending}>{editing ? 'Zapisz' : 'Utwórz szkic WZ'}</Button>}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="space-y-4">
          <Field label="Odbiorca" required><ContractorPicker value={customer} onChange={setCustomer} type="CUSTOMER" placeholder="Wybierz odbiorcę" /></Field>
          <Field label="Data wydania"><Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></Field>
          <Field label="Uwagi"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="np. nr zamówienia, sposób wysyłki" /></Field>
          <div className="space-y-1 rounded-lg bg-slate-50 p-3 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Netto</span><span className="tabular">{money(net)} zł</span></div>
            <div className="flex justify-between"><span className="text-slate-500">VAT</span><span className="tabular">{money(vat)} zł</span></div>
            <div className="flex justify-between font-semibold"><span>Brutto</span><span className="tabular">{money(net + vat)} zł</span></div>
          </div>
        </Card>
        <Card padded={false} className="lg:col-span-2">
          <CardHeader
            title="Pozycje"
            actions={<Button size="sm" variant="secondary" icon={<Plus className="size-3.5" />} onClick={() => setLines((l) => [...l, blank()])}>Dodaj pozycję</Button>}
          />
          <div className="divide-y divide-slate-100">
            {lines.map((l) => {
              const short = l.product?.stock !== undefined && Number(l.qty) > l.product.stock;
              return (
                <div key={l.key} className="grid gap-3 p-4 sm:grid-cols-12">
                  <div className="sm:col-span-5">
                    <Field label="Produkt">
                      <ProductPicker value={l.product as Product} onChange={(p) => update(l.key, { product: p, price: fromGrosze(p.salePrice), vat: String(p.vatRate) })} />
                    </Field>
                    {l.product?.stock !== undefined && (
                      <p className={`mt-1 flex items-center gap-1 text-xs ${short ? 'text-red-600' : 'text-slate-500'}`}>
                        {short && <AlertTriangle className="size-3" />}dostępne: {num(l.product.stock)} {UNIT[l.product.unit]}
                      </p>
                    )}
                  </div>
                  <div className="sm:col-span-2"><Field label="Ilość"><Input type="number" min={1} value={l.qty} onChange={(e) => update(l.key, { qty: e.target.value })} /></Field></div>
                  <div className="sm:col-span-2"><Field label="Cena netto"><Input value={l.price} onChange={(e) => update(l.key, { price: e.target.value })} inputMode="decimal" /></Field></div>
                  <div className="sm:col-span-2">
                    <Field label="VAT">
                      <Select value={l.vat} onChange={(e) => update(l.key, { vat: e.target.value })}>{['23', '8', '5', '0'].map((v) => <option key={v} value={v}>{v}%</option>)}</Select>
                    </Field>
                  </div>
                  <div className="flex items-end justify-end sm:col-span-1">
                    {lines.length > 1 && <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" />} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label="Usuń" />}
                  </div>
                </div>
              );
            })}
          </div>
          {duplicates && <p className="px-4 pb-4 text-sm text-red-600">Produkt występuje na dokumencie więcej niż raz — połącz pozycje.</p>}
        </Card>
      </div>
    </form>
  );
}
