import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/api/client';
import type { Product, ProductUnit } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useMutate } from '@/hooks/useMutate';
import { fromGrosze, toGrosze } from '@/lib/format';
import { UNIT_NAME } from '@/lib/labels';

const empty = {
  sku: '', ean: '', name: '', description: '', category: '', unit: 'PCS' as ProductUnit,
  purchasePrice: '0,00', salePrice: '0,00', vatRate: '23', minStock: '0', reorderQty: '0',
  unitsPerCarton: '', unitsPerPallet: '', isPackaging: false, trackBatches: false, active: true,
};

export function ProductFormModal({
  open,
  onClose,
  product,
  categories,
}: {
  open: boolean;
  onClose: () => void;
  product?: Product | null;
  categories: string[];
}) {
  const [f, setF] = useState(empty);
  const set = <K extends keyof typeof empty>(k: K, v: (typeof empty)[K]) => setF((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    if (!open) return;
    setF(
      product
        ? {
            sku: product.sku, ean: product.ean ?? '', name: product.name, description: product.description ?? '',
            category: product.category ?? '', unit: product.unit, purchasePrice: fromGrosze(product.purchasePrice),
            salePrice: fromGrosze(product.salePrice), vatRate: String(product.vatRate), minStock: String(product.minStock),
            reorderQty: String(product.reorderQty), unitsPerCarton: product.unitsPerCarton ? String(product.unitsPerCarton) : '',
            unitsPerPallet: product.unitsPerPallet ? String(product.unitsPerPallet) : '', isPackaging: product.isPackaging,
            trackBatches: product.trackBatches, active: product.active,
          }
        : empty,
    );
  }, [open, product]);

  const save = useMutate(
    (body: object) => (product ? api.patch(`/products/${product.id}`, body) : api.post('/products', body)),
    { invalidate: [['products'], ['product'], ['alerts']], success: product ? 'Zapisano zmiany' : 'Dodano produkt', onSuccess: onClose },
  );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const int = (v: string) => (v === '' ? null : Number(v));
    save.mutate({
      sku: f.sku.trim().toUpperCase(),
      ean: f.ean.trim() || null,
      name: f.name.trim(),
      description: f.description || undefined,
      category: f.category || undefined,
      unit: f.unit,
      purchasePrice: toGrosze(f.purchasePrice),
      salePrice: toGrosze(f.salePrice),
      vatRate: Number(f.vatRate),
      minStock: Number(f.minStock),
      reorderQty: Number(f.reorderQty || 0),
      unitsPerCarton: int(f.unitsPerCarton),
      unitsPerPallet: int(f.unitsPerPallet),
      isPackaging: f.isPackaging,
      trackBatches: f.trackBatches,
      ...(product ? { active: f.active } : {}),
    });
  };

  const margin = toGrosze(f.salePrice) - toGrosze(f.purchasePrice);
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={product ? `Edycja: ${product.sku}` : 'Nowy produkt'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Anuluj</Button>
          <Button type="submit" form="product-form" loading={save.isPending}>Zapisz</Button>
        </>
      }
    >
      <form id="product-form" onSubmit={submit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="SKU (indeks)" required>
            <Input value={f.sku} onChange={(e) => set('sku', e.target.value.toUpperCase())} required placeholder="KAR-600-400" className="font-mono" />
          </Field>
          <Field label="EAN" hint="8 lub 13 cyfr">
            <Input value={f.ean} onChange={(e) => set('ean', e.target.value.replace(/\D/g, ''))} maxLength={13} className="font-mono" />
          </Field>
          <Field label="Jednostka">
            <Select value={f.unit} onChange={(e) => set('unit', e.target.value as ProductUnit)}>
              {Object.entries(UNIT_NAME).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Nazwa" required>
          <Input value={f.name} onChange={(e) => set('name', e.target.value)} required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kategoria">
            <Input value={f.category} onChange={(e) => set('category', e.target.value)} list="categories" />
            <datalist id="categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
          <Field label="Opis">
            <Textarea value={f.description} onChange={(e) => set('description', e.target.value)} rows={1} />
          </Field>
        </div>

        <fieldset className="rounded-xl border border-slate-200 p-4">
          <legend className="px-1 text-xs font-semibold text-slate-500">Ceny i VAT</legend>
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Cena zakupu netto"><Input value={f.purchasePrice} onChange={(e) => set('purchasePrice', e.target.value)} suffix="zł" inputMode="decimal" /></Field>
            <Field label="Cena sprzedaży netto" hint={margin ? `marża ${fromGrosze(margin)} zł` : undefined}>
              <Input value={f.salePrice} onChange={(e) => set('salePrice', e.target.value)} suffix="zł" inputMode="decimal" />
            </Field>
            <Field label="Stawka VAT">
              <Select value={f.vatRate} onChange={(e) => set('vatRate', e.target.value)}>
                {['23', '8', '5', '0'].map((v) => <option key={v} value={v}>{v}%</option>)}
              </Select>
            </Field>
          </div>
        </fieldset>

        <fieldset className="rounded-xl border border-slate-200 p-4">
          <legend className="px-1 text-xs font-semibold text-slate-500">Stany i logistyka</legend>
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Stan minimalny" hint="próg alertu"><Input type="number" min={0} value={f.minStock} onChange={(e) => set('minStock', e.target.value)} /></Field>
            <Field label="Ilość zamawiana" hint="sugestia przy alercie"><Input type="number" min={0} value={f.reorderQty} onChange={(e) => set('reorderQty', e.target.value)} /></Field>
            <Field label="Szt. w kartonie"><Input type="number" min={1} value={f.unitsPerCarton} onChange={(e) => set('unitsPerCarton', e.target.value)} /></Field>
            <Field label="Szt. na palecie"><Input type="number" min={1} value={f.unitsPerPallet} onChange={(e) => set('unitsPerPallet', e.target.value)} /></Field>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Checkbox label="Materiał opakowaniowy" hint="np. kartony, taśma — zużycie wewnętrzne" checked={f.isPackaging} onChange={(v) => set('isPackaging', v)} />
            <Checkbox label="Ewidencja partii" hint="wymagany nr partii przy przyjęciu" checked={f.trackBatches} onChange={(v) => set('trackBatches', v)} />
            {product && <Checkbox label="Aktywny" checked={f.active} onChange={(v) => set('active', v)} />}
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
