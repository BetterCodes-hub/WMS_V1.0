import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { api } from '@/api/client';
import type { Contractor, Product } from '@/api/types';
import { PageHeader } from '@/components/PageHeader';
import { ContractorPicker, ProductPicker } from '@/components/Pickers';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { useMutate } from '@/hooks/useMutate';
import { fromGrosze, money, num, toGrosze, UNIT } from '@/lib/format';

interface Line {
  key: number;
  product: Product | null;
  qty: string;
  price: string;
  batch: string;
  expiry: string;
}

let seq = 0;
const newLine = (product: Product | null = null, qty = ''): Line => ({
  key: ++seq,
  product,
  qty,
  price: product ? fromGrosze(product.purchasePrice) : '',
  batch: '',
  expiry: '',
});

export default function ReceiptFormPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [supplier, setSupplier] = useState<Contractor | null>(null);
  const [docNo, setDocNo] = useState('');
  const [expected, setExpected] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([newLine()]);

  // prefill z alertu: /receipts/new?product=...&qty=...
  const prefillId = params.get('product');
  const { data: prefill } = useQuery({ enabled: !!prefillId, queryKey: ['product', prefillId], queryFn: () => api.get<Product>(`/products/${prefillId}`) });
  useEffect(() => {
    if (prefill) {
      setLines([newLine(prefill, params.get('qty') ?? '')]);
      setNotes(`Uzupełnienie stanu — ${prefill.sku} poniżej minimum`);
    }
  }, [prefill, params]);

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const save = useMutate(
    (body: object) => api.post<{ id: string; number: string }>('/receipts', body),
    { invalidate: [['receipts'], ['dashboard']], success: (r) => `Utworzono ${r.number}`, onSuccess: (r) => navigate(`/receipts/${r.id}`) },
  );

  const valid = supplier && lines.length && lines.every((l) => l.product && Number(l.qty) > 0);
  const total = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (l.price ? toGrosze(l.price) : 0), 0);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    save.mutate({
      supplierId: supplier!.id,
      supplierDocNo: docNo || undefined,
      expectedDate: expected || undefined,
      notes: notes || undefined,
      lines: lines.map((l) => ({
        productId: l.product!.id,
        expectedQty: Number(l.qty),
        unitPrice: l.price ? toGrosze(l.price) : undefined,
        batch: l.batch || undefined,
        expiryDate: l.expiry || undefined,
      })),
    });
  };

  return (
    <form onSubmit={submit}>
      <PageHeader
        back={{ to: '/receipts', label: 'Przyjęcia' }}
        title="Nowe przyjęcie — awizacja dostawy"
        description="Wprowadź pozycje z dokumentu dostawcy. Faktyczne ilości zaksięgujesz podczas rozładunku."
        actions={<Button type="submit" disabled={!valid} loading={save.isPending}>Utwórz przyjęcie</Button>}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="space-y-4">
          <Field label="Dostawca" required><ContractorPicker value={supplier} onChange={setSupplier} type="SUPPLIER" placeholder="Wybierz dostawcę" /></Field>
          <Field label="Nr dokumentu dostawcy" hint="WZ / faktura / list przewozowy"><Input value={docNo} onChange={(e) => setDocNo(e.target.value)} /></Field>
          <Field label="Planowana data dostawy"><Input type="date" value={expected} onChange={(e) => setExpected(e.target.value)} /></Field>
          <Field label="Uwagi"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </Card>
        <Card padded={false} className="lg:col-span-2">
          <CardHeader
            title="Pozycje dostawy"
            description={`${lines.length} poz. · wartość ${money(total)} zł netto`}
            actions={<Button size="sm" variant="secondary" icon={<Plus className="size-3.5" />} onClick={() => setLines((l) => [...l, newLine()])}>Dodaj pozycję</Button>}
          />
          <div className="divide-y divide-slate-100">
            {lines.map((l, i) => (
              <div key={l.key} className="grid gap-3 p-4 sm:grid-cols-12">
                <div className="flex items-center text-xs font-medium text-slate-400 sm:col-span-12">Pozycja {i + 1}</div>
                <div className="sm:col-span-6">
                  <Field label="Produkt">
                    <ProductPicker value={l.product} onChange={(p) => update(l.key, { product: p, price: fromGrosze(p.purchasePrice), qty: l.qty || String(p.unitsPerPallet ?? '') })} />
                  </Field>
                </div>
                <div className="sm:col-span-3">
                  <Field label="Ilość awizowana" hint={l.product?.unitsPerPallet ? `${num(l.product.unitsPerPallet)} / paletę` : undefined}>
                    <Input type="number" min={1} value={l.qty} onChange={(e) => update(l.key, { qty: e.target.value })} suffix={l.product ? UNIT[l.product.unit] : undefined} />
                  </Field>
                </div>
                <div className="sm:col-span-3">
                  <Field label="Cena zakupu netto"><Input value={l.price} onChange={(e) => update(l.key, { price: e.target.value })} suffix="zł" inputMode="decimal" /></Field>
                </div>
                {l.product?.trackBatches && (
                  <>
                    <div className="sm:col-span-4"><Field label="Partia"><Input value={l.batch} onChange={(e) => update(l.key, { batch: e.target.value })} /></Field></div>
                    <div className="sm:col-span-4"><Field label="Data ważności"><Input type="date" value={l.expiry} onChange={(e) => update(l.key, { expiry: e.target.value })} /></Field></div>
                  </>
                )}
                {lines.length > 1 && (
                  <div className="flex items-end justify-end sm:col-span-12">
                    <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>Usuń</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </form>
  );
}
