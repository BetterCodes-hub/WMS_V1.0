import { useEffect, useState } from 'react';
import { api } from '@/api/client';
import type { Location, Product, StockItem } from '@/api/types';
import { LocationPicker, ProductPicker } from '@/components/Pickers';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Feedback';
import { Segmented } from '@/components/ui/Tabs';
import { Modal } from '@/components/ui/Modal';
import { useMutate } from '@/hooks/useMutate';
import { num, UNIT } from '@/lib/format';

const INVALIDATE = [['inventory'], ['products'], ['product'], ['locations'], ['location'], ['handling-units'], ['handling-unit'], ['replenishment'], ['alerts'], ['dashboard']];

export function TransferModal({ item, onClose }: { item: StockItem | null; onClose: () => void }) {
  const [target, setTarget] = useState<Location | null>(null);
  const [quantity, setQuantity] = useState('');
  useEffect(() => {
    setTarget(null);
    setQuantity(item ? String(item.quantity) : '');
  }, [item]);
  const save = useMutate(
    () => api.post('/inventory/transfer', { stockItemId: item!.id, quantity: Number(quantity), toLocationId: target!.id }),
    { invalidate: INVALIDATE, success: 'Przesunięto towar', onSuccess: onClose },
  );
  if (!item) return null;
  return (
    <Modal
      open
      onClose={onClose}
      title="Przesunięcie towaru"
      description={`${item.product.sku} · ${item.product.name}`}
      size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Anuluj</Button><Button onClick={() => save.mutate()} disabled={!target || !Number(quantity)} loading={save.isPending}>Przesuń</Button></>}
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          Z lokalizacji <span className="font-mono font-medium">{item.location.code}</span>
          {item.handlingUnit && <> · jednostka …{item.handlingUnit.code.slice(-8)}</>} — dostępne <strong>{num(item.quantity)}</strong> {UNIT[item.product.unit]}
        </div>
        {item.handlingUnit && (
          <Notice tone="info">Przesunięcie części ilości zdejmuje towar z palety i odkłada go luzem. Aby przenieść całą paletę, użyj widoku palety.</Notice>
        )}
        <Field label="Lokalizacja docelowa"><LocationPicker value={target} onChange={setTarget} exclude={[item.locationId]} /></Field>
        <Field label="Ilość"><Input type="number" min={1} max={item.quantity} value={quantity} onChange={(e) => setQuantity(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

type Kind = 'PLUS' | 'MINUS' | 'CONSUMPTION';
const REASONS: Record<Kind, string[]> = {
  PLUS: ['Inwentaryzacja — nadwyżka', 'Zwrot od klienta', 'Odnaleziony towar'],
  MINUS: ['Inwentaryzacja — niedobór', 'Uszkodzenie', 'Przeterminowanie', 'Kradzież / zagubienie'],
  CONSUMPTION: ['Zużycie do pakowania wysyłek', 'Zużycie wewnętrzne'],
};

export function AdjustModal({ open, item, onClose }: { open: boolean; item?: StockItem | null; onClose: () => void }) {
  const [kind, setKind] = useState<Kind>('MINUS');
  const [product, setProduct] = useState<Product | null>(null);
  const [location, setLocation] = useState<Location | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState(REASONS.MINUS[0]);
  const [batch, setBatch] = useState('');

  useEffect(() => {
    if (!open) return;
    setKind(item ? 'MINUS' : 'PLUS');
    setReason(item ? REASONS.MINUS[0] : REASONS.PLUS[0]);
    setQuantity('1');
    setBatch('');
    setProduct(null);
    setLocation(null);
  }, [open, item]);

  const save = useMutate(
    () =>
      api.post('/inventory/adjust', {
        kind,
        productId: item?.productId ?? product!.id,
        locationId: item?.locationId ?? location!.id,
        stockItemId: kind !== 'PLUS' && item ? item.id : undefined,
        handlingUnitId: kind === 'PLUS' && item?.handlingUnitId ? item.handlingUnitId : undefined,
        batch: kind === 'PLUS' ? (item?.batch ?? (batch || undefined)) : undefined,
        expiryDate: kind === 'PLUS' && item?.expiryDate ? item.expiryDate.slice(0, 10) : undefined,
        quantity: Number(quantity),
        reason,
      }),
    { invalidate: INVALIDATE, success: 'Zaksięgowano korektę', onSuccess: onClose },
  );

  const ready = (item || (product && location)) && Number(quantity) > 0 && reason.length >= 3;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Korekta stanu / zużycie"
      description={item ? `${item.product.sku} · ${item.location.code}` : 'Ręczna zmiana stanu z zapisem powodu w historii ruchów'}
      size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Anuluj</Button><Button variant={kind === 'PLUS' ? 'success' : 'danger'} onClick={() => save.mutate()} disabled={!ready} loading={save.isPending}>Zaksięguj</Button></>}
    >
      <div className="space-y-4">
        <Segmented
          value={kind}
          onChange={(k) => { setKind(k); setReason(REASONS[k][0]); }}
          options={[{ value: 'PLUS', label: 'Przychód +' }, { value: 'MINUS', label: 'Rozchód −' }, { value: 'CONSUMPTION', label: 'Zużycie' }]}
        />
        {!item && (
          <>
            <Field label="Produkt"><ProductPicker value={product} onChange={setProduct} /></Field>
            <Field label="Lokalizacja"><LocationPicker value={location} onChange={setLocation} /></Field>
            {kind === 'PLUS' && product?.trackBatches && <Field label="Partia"><Input value={batch} onChange={(e) => setBatch(e.target.value)} /></Field>}
          </>
        )}
        {item && kind !== 'PLUS' && <p className="text-sm text-slate-600">Dostępne w tej pozycji: <strong>{num(item.quantity)}</strong></p>}
        <Field label="Ilość"><Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} /></Field>
        <Field label="Powód">
          <Select value={REASONS[kind].includes(reason) ? reason : '__other'} onChange={(e) => setReason(e.target.value === '__other' ? '' : e.target.value)}>
            {REASONS[kind].map((r) => <option key={r}>{r}</option>)}
            <option value="__other">Inny…</option>
          </Select>
          {!REASONS[kind].includes(reason) && <Input className="mt-2" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Opisz powód" />}
        </Field>
      </div>
    </Modal>
  );
}
