import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeftRight, Bell, Boxes, Building2, Calculator, ClipboardList, FileText, History, LayoutDashboard, LogOut,
  MapPin, Menu, Package, PackageCheck, PackageOpen, ScanLine, Settings, Truck, Users, Warehouse, X,
} from 'lucide-react';
import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { api } from '@/api/client';
import type { Role } from '@/api/types';
import { useLiveEvents } from '@/hooks/useLiveEvents';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/cn';
import { ROLE } from '@/lib/labels';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  roles?: Role[];
  badge?: 'alerts' | 'replenishment';
}

const NAV: { section: string; items: NavItem[] }[] = [
  { section: '', items: [{ to: '/', label: 'Pulpit', icon: <LayoutDashboard /> }] },
  {
    section: 'Procesy',
    items: [
      { to: '/receipts', label: 'Przyjęcia (PZ)', icon: <PackageCheck /> },
      { to: '/replenishment', label: 'Replenishment', icon: <ArrowLeftRight />, badge: 'replenishment' },
      { to: '/issues', label: 'Wydania (WZ)', icon: <Truck /> },
      { to: '/alerts', label: 'Alerty stanów', icon: <Bell />, badge: 'alerts' },
    ],
  },
  {
    section: 'Magazyn',
    items: [
      { to: '/inventory', label: 'Stany magazynowe', icon: <Boxes /> },
      { to: '/pallets', label: 'Palety i kartony', icon: <PackageOpen /> },
      { to: '/locations', label: 'Lokalizacje', icon: <MapPin /> },
      { to: '/movements', label: 'Historia ruchów', icon: <History /> },
    ],
  },
  {
    section: 'Księgowość',
    items: [
      { to: '/invoices', label: 'Faktury', icon: <FileText />, roles: ['MANAGER', 'ACCOUNTANT'] },
      { to: '/accounting', label: 'Rozliczenia', icon: <Calculator />, roles: ['MANAGER', 'ACCOUNTANT'] },
    ],
  },
  {
    section: 'Kartoteki',
    items: [
      { to: '/products', label: 'Produkty', icon: <Package /> },
      { to: '/contractors', label: 'Kontrahenci', icon: <Building2 /> },
    ],
  },
  {
    section: 'Administracja',
    items: [
      { to: '/users', label: 'Użytkownicy', icon: <Users />, roles: ['ADMIN'] },
      { to: '/settings', label: 'Ustawienia', icon: <Settings /> },
    ],
  },
];

function useCounters() {
  const alerts = useQuery({
    queryKey: ['alerts', 'summary'],
    queryFn: () => api.get<{ total: number; open: number; outOfStock: number }>('/alerts/summary'),
    refetchInterval: 60_000,
  });
  const repl = useQuery({
    queryKey: ['replenishment', 'counter'],
    queryFn: () => api.get<{ stats: { required: number; noReserve: number } }>('/replenishment'),
    refetchInterval: 60_000,
  });
  return {
    alerts: alerts.data?.total ?? 0,
    alertsOpen: alerts.data?.open ?? 0,
    replenishment: repl.data?.stats.required ?? 0,
  };
}

function ScanBox({ onDone }: { onDone?: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = code.trim();
    if (!value) return;
    setBusy(true);
    const tries: [string, (r: { id: string }) => string][] = [];
    const sscc = value.replace(/^\(?00\)?\s*/, '');
    if (/^\d{18}$/.test(sscc)) tries.push([`/handling-units/by-code/${sscc}`, (r) => `/pallets/${r.id}`]);
    tries.push([`/locations/by-code/${encodeURIComponent(value)}`, (r) => `/locations/${r.id}`]);
    tries.push([`/products/by-code/${encodeURIComponent(value)}`, (r) => `/products/${r.id}`]);
    for (const [url, to] of tries) {
      try {
        const r = await api.get<{ id: string }>(url);
        navigate(to(r));
        setCode('');
        onDone?.();
        setBusy(false);
        return;
      } catch {
        /* następna próba */
      }
    }
    setBusy(false);
    toast.error(`Nie rozpoznano kodu „${value}”`, { description: 'Obsługiwane: SSCC palety, kod lokalizacji, SKU lub EAN produktu' });
  };

  return (
    <form onSubmit={submit} className="relative w-full">
      <ScanLine className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        disabled={busy}
        placeholder="Skanuj: SSCC, lokalizacja, SKU / EAN…"
        className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pr-3 pl-9 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
      />
    </form>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { can } = useAuth();
  const counters = useCounters();
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {NAV.map((group) => {
        const items = group.items.filter((i) => !i.roles || can(...i.roles));
        if (!items.length) return null;
        return (
          <div key={group.section}>
            {group.section && (
              <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">{group.section}</p>
            )}
            <ul className="space-y-0.5">
              {items.map((item) => {
                const count = item.badge ? counters[item.badge] : 0;
                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.to === '/'}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        cn(
                          'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors [&_svg]:size-4',
                          isActive ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-100',
                        )
                      }
                    >
                      {item.icon}
                      <span className="flex-1">{item.label}</span>
                      {count > 0 && (
                        <span
                          className={cn(
                            'rounded-full px-1.5 py-0.5 text-[11px] leading-none font-semibold tabular',
                            item.badge === 'alerts' ? 'bg-red-500 text-white' : 'bg-amber-400 text-slate-900',
                          )}
                        >
                          {count}
                        </span>
                      )}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

export function AppLayout() {
  const { user, logout } = useAuth();
  const [drawer, setDrawer] = useState(false);
  const location = useLocation();
  const counters = useCounters();
  useLiveEvents(!!user);
  useEffect(() => setDrawer(false), [location.pathname]);

  const brand = (
    <Link to="/" className="flex items-center gap-2.5 px-5 py-4">
      <div className="rounded-lg bg-brand-600 p-1.5 text-white">
        <Warehouse className="size-5" />
      </div>
      <div>
        <p className="text-sm font-semibold text-white">WMS</p>
        <p className="text-[11px] text-slate-400">Zarządzanie magazynem</p>
      </div>
    </Link>
  );

  const userBox = (
    <div className="border-t border-white/10 p-3">
      <div className="flex items-center gap-3 rounded-lg px-2 py-2">
        <div className="flex size-8 items-center justify-center rounded-full bg-brand-500/20 text-xs font-semibold text-brand-100">
          {user?.name.split(' ').map((p) => p[0]).join('').slice(0, 2)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-100">{user?.name}</p>
          <p className="truncate text-xs text-slate-400">{user && ROLE[user.role]}</p>
        </div>
        <button onClick={logout} title="Wyloguj" className="rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white">
          <LogOut className="size-4" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      {/* sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-slate-900 lg:flex">
        {brand}
        <Sidebar />
        {userBox}
      </aside>

      {/* drawer mobile */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setDrawer(false)} />
          <aside className="relative flex h-full w-72 max-w-[85vw] flex-col bg-slate-900">
            <div className="flex items-center justify-between pr-3">
              {brand}
              <button onClick={() => setDrawer(false)} className="rounded-md p-1.5 text-slate-400 hover:text-white">
                <X className="size-5" />
              </button>
            </div>
            <Sidebar onNavigate={() => setDrawer(false)} />
            {userBox}
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <button onClick={() => setDrawer(true)} className="-ml-1 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden">
            <Menu className="size-5" />
          </button>
          <div className="max-w-md flex-1">
            <ScanBox />
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Link to="/replenishment" className="relative hidden rounded-lg p-2 text-slate-500 hover:bg-slate-100 sm:block" title="Replenishment">
              <ClipboardList className="size-5" />
              {counters.replenishment > 0 && (
                <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-amber-400 text-[10px] font-bold text-slate-900">
                  {counters.replenishment}
                </span>
              )}
            </Link>
            <Link to="/alerts" className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Alerty stanów">
              <Bell className="size-5" />
              {counters.alerts > 0 && (
                <span
                  className={cn(
                    'absolute top-1 right-1 flex size-4 items-center justify-center rounded-full text-[10px] font-bold text-white',
                    counters.alertsOpen > 0 ? 'animate-pulse bg-red-500' : 'bg-slate-400',
                  )}
                >
                  {counters.alerts}
                </span>
              )}
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
