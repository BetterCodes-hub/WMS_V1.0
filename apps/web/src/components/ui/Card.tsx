import { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Card({ children, className, padded = true }: { children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <div className={cn('rounded-xl border border-slate-200 bg-white shadow-sm', padded && 'p-5', className)}>{children}</div>
  );
}

export function CardHeader({ title, description, actions, icon }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
      <div className="flex items-start gap-3">
        {icon && <div className="mt-0.5 text-slate-400">{icon}</div>}
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'slate',
  onClick,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: 'slate' | 'brand' | 'amber' | 'red' | 'green';
  onClick?: () => void;
}) {
  const tones = {
    slate: 'bg-slate-100 text-slate-600',
    brand: 'bg-brand-50 text-brand-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
    green: 'bg-emerald-50 text-emerald-600',
  };
  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-xl border border-slate-200 bg-white p-4 shadow-sm',
        onClick && 'cursor-pointer transition hover:border-brand-300 hover:shadow',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        {icon && <div className={cn('rounded-lg p-1.5', tones[tone])}>{icon}</div>}
      </div>
      <p className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-900 tabular">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
