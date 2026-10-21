import { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type Tone = 'gray' | 'blue' | 'green' | 'amber' | 'red' | 'indigo' | 'violet';

const TONES: Record<Tone, string> = {
  gray: 'bg-slate-100 text-slate-700 ring-slate-500/15',
  blue: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/25',
  red: 'bg-red-50 text-red-700 ring-red-600/20',
  indigo: 'bg-brand-50 text-brand-700 ring-brand-600/20',
  violet: 'bg-violet-50 text-violet-700 ring-violet-600/20',
};

export function Badge({ tone = 'gray', children, dot, className }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset',
        TONES[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
