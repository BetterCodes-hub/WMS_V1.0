import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';
import { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Spinner({ className }: { className?: string }) {
  return (
    <div className={cn('flex justify-center', className)}>
      <Loader2 className="size-6 animate-spin text-slate-400" />
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-3 rounded-full bg-slate-100 p-3 text-slate-400">{icon ?? <Inbox className="size-6" />}</div>
      <p className="text-sm font-medium text-slate-900">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error }: { error: Error }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      <AlertTriangle className="size-5 shrink-0" />
      {error.message}
    </div>
  );
}

export function Notice({ tone = 'info', children, icon }: { tone?: 'info' | 'warning' | 'danger' | 'success'; children: ReactNode; icon?: ReactNode }) {
  const tones = {
    info: 'border-sky-200 bg-sky-50 text-sky-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    danger: 'border-red-200 bg-red-50 text-red-800',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  };
  return (
    <div className={cn('flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm', tones[tone])}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div>{children}</div>
    </div>
  );
}

export function Progress({ value, tone = 'brand', marker, className }: { value: number; tone?: 'brand' | 'green' | 'amber' | 'red'; marker?: number; className?: string }) {
  const tones = { brand: 'bg-brand-500', green: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-red-500' };
  return (
    <div className={cn('relative h-2 w-full overflow-hidden rounded-full bg-slate-100', className)}>
      <div className={cn('h-full rounded-full transition-all', tones[tone])} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      {marker !== undefined && (
        <div className="absolute inset-y-0 w-0.5 bg-slate-700/60" style={{ left: `${Math.min(100, marker)}%` }} title="minimum" />
      )}
    </div>
  );
}
