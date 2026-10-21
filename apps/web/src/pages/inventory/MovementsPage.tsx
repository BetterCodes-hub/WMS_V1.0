import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { api } from '@/api/client';
import type { Movement, MovementType, Paginated } from '@/api/types';
import { PageHeader } from '@/components/PageHeader';
import { SearchInput } from '@/components/SearchInput';
import { Card } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Field';
import { Pagination } from '@/components/ui/Table';
import { useDebounce } from '@/hooks/useDebounce';
import { MOVEMENT } from '@/lib/labels';
import { MovementsTable } from './MovementsTable';

export default function MovementsPage() {
  const [params] = useSearchParams();
  const productId = params.get('productId') ?? undefined;
  const [search, setSearch] = useState('');
  const [type, setType] = useState<MovementType | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounce(search);

  const { data, isLoading } = useQuery({
    queryKey: ['inventory', 'movements', q, type, from, to, page, productId],
    queryFn: () => api.get<Paginated<Movement>>('/inventory/movements', { search: q, type, from, to, page, productId, pageSize: 50 }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader title="Historia ruchów" description="Pełny dziennik operacji magazynowych — kto, co, skąd, dokąd i kiedy" />
      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Produkt lub nr dokumentu…" />
          <Select value={type} onChange={(e) => { setType(e.target.value as MovementType); setPage(1); }} className="w-auto">
            <option value="">Wszystkie operacje</option>
            {Object.entries(MOVEMENT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            od <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-auto" />
            do <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-auto" />
          </div>
        </div>
        <MovementsTable rows={data?.items} loading={isLoading} />
        {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
      </Card>
    </>
  );
}
