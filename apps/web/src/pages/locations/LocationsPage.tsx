import { useQuery } from '@tanstack/react-query';
import { Grid3x3, LayoutGrid, List, Plus } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '@/api/client';
import type { Location, LocationType } from '@/api/types';
import { PageHeader } from '@/components/PageHeader';
import { SearchInput } from '@/components/SearchInput';
import { LocationTypeBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { DataTable } from '@/components/ui/Table';
import { Segmented } from '@/components/ui/Tabs';
import { useMutate } from '@/hooks/useMutate';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/cn';
import { num } from '@/lib/format';
import { LOCATION_TYPE } from '@/lib/labels';

export default function LocationsPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [type, setType] = useState<LocationType | ''>('');
  const [view, setView] = useState<'map' | 'list'>('map');
  const [create, setCreate] = useState(false);
  const [generate, setGenerate] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ['locations', type], queryFn: () => api.get<Location[]>('/locations', { type }) });

  const filtered = useMemo(() => (data ?? []).filter((l) => !search || l.code.includes(search.toUpperCase())), [data, search]);
  const zones = useMemo(() => {
    const map = new Map<string, Location[]>();
    filtered.forEach((l) => map.set(l.zone, [...(map.get(l.zone) ?? []), l]));
    return [...map.entries()];
  }, [filtered]);

  const occupancy = (l: Location) => (l.maxPallets ? l.pallets / l.maxPallets : l.totalQty > 0 ? 1 : 0);

  return (
    <>
      <PageHeader
        title="Lokalizacje"
        description="Mapa magazynu: strefy przyjęć, składowania (rezerwa), kompletacji i wysyłek"
        actions={
          can('MANAGER') && (
            <>
              <Button variant="secondary" icon={<Grid3x3 className="size-4" />} onClick={() => setGenerate(true)}>Generuj regały</Button>
              <Button icon={<Plus className="size-4" />} onClick={() => setCreate(true)}>Nowa lokalizacja</Button>
            </>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Kod lokalizacji…" />
        <Select value={type} onChange={(e) => setType(e.target.value as LocationType)} className="w-auto">
          <option value="">Wszystkie typy</option>
          {Object.entries(LOCATION_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <div className="ml-auto">
          <Segmented value={view} onChange={setView} options={[{ value: 'map', label: 'Mapa', icon: <LayoutGrid className="size-4" /> }, { value: 'list', label: 'Lista', icon: <List className="size-4" /> }]} />
        </div>
      </div>

      {view === 'map' ? (
        <div className="space-y-4">
          {zones.map(([zone, locs]) => (
            <Card key={zone}>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">Strefa {zone}</h3>
                  <LocationTypeBadge type={locs[0].type} />
                </div>
                <span className="text-xs text-slate-500">
                  {locs.filter((l) => occupancy(l) > 0).length} / {locs.length} zajętych
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6 lg:grid-cols-9 xl:grid-cols-12">
                {locs.map((l) => {
                  const occ = occupancy(l);
                  return (
                    <button
                      key={l.id}
                      onClick={() => navigate(`/locations/${l.id}`)}
                      title={`${l.code} · ${num(l.totalQty)} szt. · ${l.stockLines} poz.`}
                      className={cn(
                        'rounded-md border px-1.5 py-2 text-center font-mono text-[11px] transition hover:ring-2 hover:ring-brand-400',
                        occ >= 1 ? 'border-brand-300 bg-brand-100 text-brand-900' : occ > 0 ? 'border-brand-200 bg-brand-50 text-brand-800' : 'border-slate-200 bg-slate-50 text-slate-500',
                        !l.active && 'opacity-40',
                      )}
                    >
                      {l.code.replace(`${zone}-`, '')}
                      <span className="block text-[10px] font-sans text-current/70">{l.totalQty ? num(l.totalQty) : 'wolna'}</span>
                    </button>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card padded={false}>
          <DataTable
            loading={isLoading}
            rows={filtered}
            rowKey={(l) => l.id}
            onRowClick={(l) => navigate(`/locations/${l.id}`)}
            columns={[
              { key: 'code', header: 'Kod', cell: (l) => <span className="font-mono font-medium">{l.code}</span> },
              { key: 'name', header: 'Nazwa', hideOnMobile: true, cell: (l) => l.name ?? <span className="text-slate-400">—</span> },
              { key: 'zone', header: 'Strefa', cell: (l) => l.zone },
              { key: 'type', header: 'Typ', cell: (l) => <LocationTypeBadge type={l.type} /> },
              { key: 'pallets', header: 'Palety', align: 'right', cell: (l) => (l.maxPallets ? `${l.pallets} / ${l.maxPallets}` : l.pallets || '—') },
              { key: 'lines', header: 'Pozycje', align: 'right', hideOnMobile: true, cell: (l) => l.stockLines },
              { key: 'qty', header: 'Ilość', align: 'right', cell: (l) => <span className="tabular">{num(l.totalQty)}</span> },
            ]}
          />
        </Card>
      )}
      <CreateLocationModal open={create} onClose={() => setCreate(false)} />
      <GenerateModal open={generate} onClose={() => setGenerate(false)} />
    </>
  );
}

function CreateLocationModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [f, setF] = useState({ code: '', name: '', zone: '', type: 'STORAGE' as LocationType, maxPallets: '' });
  const save = useMutate(
    () => api.post('/locations', { ...f, name: f.name || undefined, maxPallets: f.maxPallets ? Number(f.maxPallets) : undefined }),
    { invalidate: [['locations']], success: 'Dodano lokalizację', onSuccess: onClose },
  );
  const submit = (e: FormEvent) => { e.preventDefault(); save.mutate(); };
  return (
    <Modal open={open} onClose={onClose} title="Nowa lokalizacja" size="sm" footer={<><Button variant="secondary" onClick={onClose}>Anuluj</Button><Button type="submit" form="loc-form" loading={save.isPending}>Dodaj</Button></>}>
      <form id="loc-form" onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kod" required><Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} className="font-mono" placeholder="A-01-01-01" required /></Field>
          <Field label="Strefa" required><Input value={f.zone} onChange={(e) => setF({ ...f, zone: e.target.value.toUpperCase() })} placeholder="A" required /></Field>
        </div>
        <Field label="Typ">
          <Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as LocationType })}>
            {Object.entries(LOCATION_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="Nazwa"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Pojemność (palety)" hint="puste = bez limitu"><Input type="number" min={1} value={f.maxPallets} onChange={(e) => setF({ ...f, maxPallets: e.target.value })} /></Field>
      </form>
    </Modal>
  );
}

function GenerateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [f, setF] = useState({ zone: 'C', type: 'STORAGE' as LocationType, aisles: '2', racks: '5', levels: '3', maxPallets: '1' });
  const count = Number(f.aisles) * Number(f.racks) * Number(f.levels);
  const save = useMutate(
    () => api.post<{ created: number; skipped: number }>('/locations/generate', {
      zone: f.zone, type: f.type, aisles: Number(f.aisles), racks: Number(f.racks), levels: Number(f.levels), maxPallets: f.maxPallets ? Number(f.maxPallets) : undefined,
    }),
    { invalidate: [['locations']], success: (r) => `Utworzono ${r.created} lokalizacji${r.skipped ? `, pominięto ${r.skipped} istniejących` : ''}`, onSuccess: onClose },
  );
  return (
    <Modal open={open} onClose={onClose} title="Generator lokalizacji regałowych" description="Kody w formacie STREFA-ALEJKA-REGAŁ-POZIOM" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Anuluj</Button><Button onClick={() => save.mutate()} loading={save.isPending} disabled={!count || count > 5000}>Utwórz {count || ''}</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Strefa"><Input value={f.zone} maxLength={3} onChange={(e) => setF({ ...f, zone: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') })} /></Field>
          <Field label="Typ">
            <Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as LocationType })}>
              <option value="STORAGE">Składowanie</option>
              <option value="PICKING">Kompletacja</option>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <Field label="Alejki"><Input type="number" min={1} max={50} value={f.aisles} onChange={(e) => setF({ ...f, aisles: e.target.value })} /></Field>
          <Field label="Regały"><Input type="number" min={1} max={50} value={f.racks} onChange={(e) => setF({ ...f, racks: e.target.value })} /></Field>
          <Field label="Poziomy"><Input type="number" min={1} max={10} value={f.levels} onChange={(e) => setF({ ...f, levels: e.target.value })} /></Field>
          <Field label="Palet/miejsce"><Input type="number" min={1} value={f.maxPallets} onChange={(e) => setF({ ...f, maxPallets: e.target.value })} /></Field>
        </div>
        <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
          Przykład: <span className="font-mono">{f.zone}-01-01-01</span> … <span className="font-mono">{f.zone}-{String(f.aisles).padStart(2, '0')}-{String(f.racks).padStart(2, '0')}-{String(f.levels).padStart(2, '0')}</span>
        </p>
      </div>
    </Modal>
  );
}
