import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { api } from '@/api/client';
import type { Contractor, ContractorType, Location, LocationType, Paginated, Product } from '@/api/types';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/lib/cn';
import { num, UNIT } from '@/lib/format';
import { LOCATION_TYPE } from '@/lib/labels';

interface ComboOption<T> {
  value: string;
  label: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  data: T;
}

/** Combobox z wyszukiwaniem po stronie serwera. */
function Combobox<T>({
  value,
  selectedLabel,
  onSearch,
  options,
  onSelect,
  placeholder,
  loading,
  disabled,
}: {
  value?: string | null;
  selectedLabel?: ReactNode;
  onSearch: (q: string) => void;
  options: ComboOption<T>[];
  onSelect: (opt: T) => void;
  placeholder: string;
  loading?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => onSearch(query), [query, onSearch]);
  useEffect(() => setActive(0), [options.length]);
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const choose = (o: ComboOption<T>) => {
    onSelect(o.data);
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 text-left text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none disabled:bg-slate-50"
      >
        <span className={cn('truncate', !value && 'text-slate-400')}>{value ? selectedLabel : placeholder}</span>
        <ChevronsUpDown className="size-4 shrink-0 text-slate-400" />
      </button>
      {open && (
        <div className="absolute z-40 mt-1 w-full min-w-72 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center gap-2 border-b border-slate-100 px-3">
            <Search className="size-4 text-slate-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, options.length - 1)); }
                if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                if (e.key === 'Enter' && options[active]) { e.preventDefault(); choose(options[active]); }
              }}
              placeholder="Szukaj lub zeskanuj kod…"
              className="h-10 w-full text-sm outline-none"
            />
          </div>
          <ul className="max-h-64 overflow-y-auto py-1">
            {loading && <li className="px-3 py-2 text-sm text-slate-400">Szukam…</li>}
            {!loading && !options.length && <li className="px-3 py-2 text-sm text-slate-400">Brak wyników</li>}
            {options.map((o, i) => (
              <li
                key={o.value}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(o)}
                className={cn('flex cursor-pointer items-center gap-2 px-3 py-2 text-sm', i === active && 'bg-brand-50')}
              >
                <Check className={cn('size-4 shrink-0 text-brand-600', o.value !== value && 'invisible')} />
                <div className="min-w-0 flex-1">
                  <div className="truncate">{o.label}</div>
                  {o.sub && <div className="truncate text-xs text-slate-500">{o.sub}</div>}
                </div>
                {o.right && <div className="shrink-0 text-xs text-slate-500">{o.right}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function ProductPicker({
  value,
  onChange,
  placeholder = 'Wybierz produkt',
  disabled,
}: {
  value?: Product | null;
  onChange: (p: Product) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [q, setQ] = useState('');
  const search = useDebounce(q, 200);
  const { data, isFetching } = useQuery({
    queryKey: ['products', 'picker', search],
    queryFn: () => api.get<Paginated<Product>>('/products', { search, pageSize: 30 }),
  });
  return (
    <Combobox
      value={value?.id}
      selectedLabel={value && <><span className="font-mono text-xs text-slate-500">{value.sku}</span> {value.name}</>}
      onSearch={setQ}
      loading={isFetching && !data}
      disabled={disabled}
      placeholder={placeholder}
      onSelect={onChange}
      options={(data?.items ?? []).map((p) => ({
        value: p.id,
        data: p,
        label: <><span className="font-mono text-xs text-slate-500">{p.sku}</span> {p.name}</>,
        sub: p.ean ? `EAN ${p.ean}` : p.category,
        right: `${num(p.stock)} ${UNIT[p.unit]}`,
      }))}
    />
  );
}

export function ContractorPicker({
  value,
  onChange,
  type,
  placeholder = 'Wybierz kontrahenta',
  disabled,
}: {
  value?: Contractor | null;
  onChange: (c: Contractor) => void;
  type?: ContractorType;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [q, setQ] = useState('');
  const search = useDebounce(q, 200);
  const { data, isFetching } = useQuery({
    queryKey: ['contractors', 'picker', type, search],
    queryFn: () => api.get<Paginated<Contractor>>('/contractors', { search, type, pageSize: 30 }),
  });
  return (
    <Combobox
      value={value?.id}
      selectedLabel={value?.name}
      onSearch={setQ}
      loading={isFetching && !data}
      disabled={disabled}
      placeholder={placeholder}
      onSelect={onChange}
      options={(data?.items ?? [])
        .filter((c) => c.active)
        .map((c) => ({
          value: c.id,
          data: c,
          label: c.name,
          sub: [c.nip && `NIP ${c.nip}`, c.city].filter(Boolean).join(' · '),
        }))}
    />
  );
}

export function LocationPicker({
  value,
  onChange,
  types,
  placeholder = 'Wybierz lokalizację',
  disabled,
  preferEmpty,
  exclude,
}: {
  value?: Location | null;
  onChange: (l: Location) => void;
  types?: LocationType[];
  placeholder?: string;
  disabled?: boolean;
  /** sortuj wolne lokalizacje na początek (rozlokowanie palet) */
  preferEmpty?: boolean;
  exclude?: string[];
}) {
  const [q, setQ] = useState('');
  const { data, isFetching } = useQuery({
    queryKey: ['locations', 'picker'],
    queryFn: () => api.get<Location[]>('/locations'),
    staleTime: 10_000,
  });
  const search = q.trim().toUpperCase();
  let list = (data ?? []).filter(
    (l) => (!types || types.includes(l.type)) && (!search || l.code.includes(search)) && !exclude?.includes(l.id),
  );
  if (preferEmpty) {
    const free = (l: Location) => (l.maxPallets ? l.pallets < l.maxPallets : true);
    list = [...list].sort((a, b) => Number(free(b)) - Number(free(a)) || a.pallets - b.pallets || a.code.localeCompare(b.code));
  }
  return (
    <Combobox
      value={value?.id}
      selectedLabel={value && <span className="font-mono">{value.code}</span>}
      onSearch={setQ}
      loading={isFetching && !data}
      disabled={disabled}
      placeholder={placeholder}
      onSelect={onChange}
      options={list.slice(0, 80).map((l) => ({
        value: l.id,
        data: l,
        label: <span className="font-mono">{l.code}</span>,
        sub: `${LOCATION_TYPE[l.type]}${l.name ? ` · ${l.name}` : ''}`,
        right: l.maxPallets
          ? `${l.pallets}/${l.maxPallets} pal.`
          : l.totalQty
            ? `${num(l.totalQty)} szt.`
            : 'wolna',
      }))}
    />
  );
}
