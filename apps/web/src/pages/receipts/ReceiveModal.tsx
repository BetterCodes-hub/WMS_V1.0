import { useQuery } from '@tanstack/react-query';
import { Box, CheckCircle2, Hash, Layers, Printer } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api, openFile } from '@/api/client';
import type { Location, ReceiptDetail, ReceiptLine, ReceiptMode } from '@/api/types';
import { LocationPicker } from '@/components/Pickers';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { Segmented } from '@/components/ui/Tabs';
import { useMutate } from '@/hooks/useMutate';
import { num, UNIT } from '@/lib/format';

interface ReceiveResult {
  received: number;
  location: string;
  overReceipt: boolean;
  handlingUnits: { id: string; code: string; type: 'PALLET' | 'CARTON' }[];
}

const INVALIDATE = [['receipt'], ['receipts'], ['inventory'], ['handling-units'], ['products'], ['product'], ['alerts'], ['dashboard'], ['locations']];

export function ReceiveModal({ receipt, line, onClose }: { receipt: ReceiptDetail; line: ReceiptLine | null; onClose: () => void }) {
  const remaining = line ? Math.max(0, line.expectedQty - line.receivedQty) : 0;
  const [mode, setMode] = useState<ReceiptMode>('PALLET');
  const [location, setLocation] = useState<Location | null>(null);
  const [quantity, setQuantity] = useState('');
  const [palletCount, setPalletCount] = useState('1');
  const [qtyPerPallet, setQtyPerPallet] = useState('');
  const [cartonCount, setCartonCount] = useState('');
  const [qtyPerCarton, setQtyPerCarton] = useState('');
  const [mother, setMother] = useState('');
  const [target, setTarget] = useState('');
  const [batch, setBatch] = useState('');
  const [expiry, setExpiry] = useState('');
  const [result, setResult] = useState<ReceiveResult | null>(null);

  const { data: locations } = useQuery({ queryKey: ['locations', 'picker'], queryFn: () => api.get<Location[]>('/locations') });

  // domyślne wartości na podstawie parametrów logistycznych produktu
  useEffect(() => {
    if (!line) return;
    const p = line.product;
    setResult(null);
    setQuantity(String(remaining || ''));
    const perPallet = p.unitsPerPallet ?? (remaining || 1);
    setQtyPerPallet(String(Math.min(perPallet, remaining || perPallet)));
    setPalletCount(String(Math.max(1, Math.floor((remaining || perPallet) / perPallet))));
    const perCarton = p.unitsPerCarton ?? 10;
    setQtyPerCarton(String(perCarton));
    setCartonCount(String(Math.max(1, Math.floor((remaining || perCarton) / perCarton))));
    setMode(p.unitsPerPallet ? 'PALLET' : p.unitsPerCarton ? 'MIXED_PALLET' : 'PIECE');
    setBatch(line.batch ?? '');
    setExpiry(line.expiryDate?.slice(0, 10) ?? '');
    setMother('');
    setTarget('');
  }, [line, remaining]);

  useEffect(() => {
    if (!location && locations) setLocation(locations.find((l) => l.type === 'RECEIVING') ?? null);
  }, [locations, location]);

  // palety z tego przyjęcia, które nadal stoją w strefie przyjęć — można na nie dołożyć towar
  const dockPallets = useMemo(
    () => receipt.handlingUnits.filter((h) => h.type === 'PALLET' && h.location?.type === 'RECEIVING' && h.location.code === location?.code),
    [receipt.handlingUnits, location],
  );

  const total =
    mode === 'PIECE' ? Number(quantity) || 0
    : mode === 'PALLET' ? (Number(palletCount) || 0) * (Number(qtyPerPallet) || 0)
    : (Number(cartonCount) || 0) * (Number(qtyPerCarton) || 0);
  const newUnits = mode === 'PALLET' ? Number(palletCount) || 0 : mode === 'MIXED_PALLET' ? (Number(cartonCount) || 0) + (mother ? 0 : 1) : 0;
  const over = line ? line.receivedQty + total - line.expectedQty : 0;

  const receive = useMutate(
    () =>
      api.post<ReceiveResult>(`/receipts/${receipt.id}/receive`, {
        lineId: line!.id,
        mode,
        locationId: location?.id,
        batch: batch || undefined,
        expiryDate: expiry || undefined,
        ...(mode === 'PIECE' && { quantity: Number(quantity), targetHandlingUnitId: target || undefined }),
        ...(mode === 'PALLET' && { palletCount: Number(palletCount), qtyPerPallet: Number(qtyPerPallet) }),
        ...(mode === 'MIXED_PALLET' && { cartonCount: Number(cartonCount), qtyPerCarton: Number(qtyPerCarton), motherPalletId: mother || undefined }),
      }),
    { invalidate: INVALIDATE, success: (r) => `Przyjęto ${num(r.received)} ${UNIT[line!.product.unit]} na ${r.location}`, onSuccess: setResult },
  );

  if (!line) return null;
  const unit = UNIT[line.product.unit];
  const needsBatch = line.product.trackBatches;

  if (result) {
    const pallets = result.handlingUnits.filter((h) => h.type === 'PALLET');
    return (
      <Modal open onClose={onClose} title="Towar przyjęty" size="md"
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>Zamknij</Button>
            {result.handlingUnits.length > 0 && (
              <Button icon={<Printer className="size-4" />} onClick={() => openFile(`/receipts/${receipt.id}/labels`).catch((e) => toast.error(e.message))}>
                Drukuj etykiety palet
              </Button>
            )}
          </>
        }>
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-4 text-emerald-800">
            <CheckCircle2 className="size-8 shrink-0" />
            <div>
              <p className="font-semibold">{num(result.received)} {unit} — {line.product.name}</p>
              <p className="text-sm">Lokalizacja {result.location}{pallets.length ? ` · ${pallets.length} pal.` : ''}{result.handlingUnits.length - pallets.length ? ` · ${result.handlingUnits.length - pallets.length} kart.` : ''}</p>
            </div>
          </div>
          {result.overReceipt && <Notice tone="warning">Przyjęto więcej niż awizowano — różnica zostanie wykazana na dokumencie PZ.</Notice>}
          {result.handlingUnits.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-slate-500">Nadane numery SSCC</p>
              <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                {result.handlingUnits.map((h) => (
                  <li key={h.id} className="flex items-center gap-2 font-mono text-xs">
                    {h.type === 'PALLET' ? <Layers className="size-3.5 text-brand-600" /> : <Box className="size-3.5 text-amber-600 ml-4" />}
                    {h.code}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`Przyjęcie: ${line.product.sku}`}
      description={line.product.name}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Anuluj</Button>
          <Button onClick={() => receive.mutate()} loading={receive.isPending} disabled={!total || !location || (needsBatch && !batch)}>
            Przyjmij {total ? `${num(total)} ${unit}` : ''}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            ['Awizowano', line.expectedQty],
            ['Przyjęto', line.receivedQty],
            ['Pozostało', remaining],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-lg bg-slate-50 py-2">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="text-lg font-semibold tabular">{num(value as number)}</p>
            </div>
          ))}
        </div>

        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'PIECE', label: 'Na sztuki', icon: <Hash className="size-4" /> },
            { value: 'PALLET', label: 'Palety', icon: <Layers className="size-4" /> },
            { value: 'MIXED_PALLET', label: 'Paleta matczyna', icon: <Box className="size-4" /> },
          ]}
        />

        {mode === 'PIECE' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Ilość"><Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} suffix={unit} autoFocus /></Field>
            <Field label="Odłóż na" hint="np. dokładanie luźnych sztuk na paletę mieszaną">
              <Select value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">luzem w lokalizacji</option>
                {dockPallets.map((p) => <option key={p.id} value={p.id}>paleta …{p.code.slice(-8)}{p._count.children ? ` (${p._count.children} kart.)` : ''}</option>)}
              </Select>
            </Field>
          </div>
        )}

        {mode === 'PALLET' && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Liczba palet"><Input type="number" min={1} max={100} value={palletCount} onChange={(e) => setPalletCount(e.target.value)} autoFocus /></Field>
              <Field label="Sztuk na palecie" hint={line.product.unitsPerPallet ? `standard: ${num(line.product.unitsPerPallet)}` : undefined}>
                <Input type="number" min={1} value={qtyPerPallet} onChange={(e) => setQtyPerPallet(e.target.value)} suffix={unit} />
              </Field>
            </div>
            <p className="text-xs text-slate-500">Każda paleta otrzyma własny numer SSCC i etykietę. Paleta jednorodna = jeden produkt.</p>
          </>
        )}

        {mode === 'MIXED_PALLET' && (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Paleta matczyna">
                <Select value={mother} onChange={(e) => setMother(e.target.value)}>
                  <option value="">+ nowa paleta</option>
                  {dockPallets.map((p) => <option key={p.id} value={p.id}>…{p.code.slice(-8)} ({p._count.children} kart.)</option>)}
                </Select>
              </Field>
              <Field label="Liczba kartonów"><Input type="number" min={1} max={500} value={cartonCount} onChange={(e) => setCartonCount(e.target.value)} autoFocus /></Field>
              <Field label="Sztuk w kartonie" hint={line.product.unitsPerCarton ? `standard: ${line.product.unitsPerCarton}` : undefined}>
                <Input type="number" min={1} value={qtyPerCarton} onChange={(e) => setQtyPerCarton(e.target.value)} suffix={unit} />
              </Field>
            </div>
            <p className="text-xs text-slate-500">
              Kartony otrzymają własne numery SSCC i zostaną przypisane do palety matczynej — przy przenoszeniu palety przemieszczają się razem z nią.
              Wybierz istniejącą paletę, aby zbudować paletę mieszaną z wielu produktów.
            </p>
          </>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Miejsce przyjęcia"><LocationPicker value={location} onChange={(l) => { setLocation(l); setMother(''); setTarget(''); }} types={['RECEIVING', 'QUARANTINE']} /></Field>
          {(needsBatch || line.batch) && (
            <>
              <Field label="Partia" required={needsBatch}><Input value={batch} onChange={(e) => setBatch(e.target.value)} /></Field>
              <Field label="Data ważności"><Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></Field>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
          <div>
            <p className="text-xs text-brand-700">Do zaksięgowania</p>
            <p className="text-xl font-semibold text-brand-900 tabular">{num(total)} {unit}</p>
          </div>
          {newUnits > 0 && <p className="text-sm text-brand-800">{newUnits} nowych etykiet SSCC</p>}
        </div>
        {over > 0 && <Notice tone="warning">Ilość przekracza awizację o {num(over)} {unit}. Nadwyżka zostanie wykazana jako rozbieżność.</Notice>}
      </div>
    </Modal>
  );
}
