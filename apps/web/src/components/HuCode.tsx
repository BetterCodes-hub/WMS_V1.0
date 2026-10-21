import { Box, Layers } from 'lucide-react';
import { Link } from 'react-router';
import type { HuType } from '@/api/types';

/** Skrócony kod SSCC z ikoną typu jednostki (pełny kod w podpowiedzi). */
export function HuCode({ id, code, type, full }: { id?: string; code: string; type: HuType; full?: boolean }) {
  const content = (
    <span className="inline-flex items-center gap-1 font-mono text-xs" title={`SSCC ${code}`}>
      {type === 'PALLET' ? <Layers className="size-3.5 text-slate-400" /> : <Box className="size-3.5 text-slate-400" />}
      {full ? code : `…${code.slice(-8)}`}
    </span>
  );
  return id ? (
    <Link to={`/pallets/${id}`} onClick={(e) => e.stopPropagation()} className="hover:text-brand-700">
      {content}
    </Link>
  ) : (
    content
  );
}
