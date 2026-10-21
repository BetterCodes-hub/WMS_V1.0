import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Building2, Plus } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/api/client';
import type { Contractor, ContractorType, Paginated } from '@/api/types';
import { PageHeader } from '@/components/PageHeader';
import { SearchInput } from '@/components/SearchInput';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Checkbox, Field, Input, Select } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { DataTable, Pagination } from '@/components/ui/Table';
import { Tabs } from '@/components/ui/Tabs';
import { useDebounce } from '@/hooks/useDebounce';
import { useMutate } from '@/hooks/useMutate';
import { useAuth } from '@/lib/auth';
import { CONTRACTOR_TYPE } from '@/lib/labels';

export default function ContractorsPage() {
  const { can } = useAuth();
  const [type, setType] = useState<ContractorType | ''>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Contractor | null | 'new'>(null);
  const q = useDebounce(search);
  const { data, isLoading } = useQuery({
    queryKey: ['contractors', type, q, page],
    queryFn: () => api.get<Paginated<Contractor>>('/contractors', { type, search: q, page, pageSize: 25 }),
    placeholderData: keepPreviousData,
  });
  const canEdit = can('MANAGER', 'ACCOUNTANT');

  return (
    <>
      <PageHeader
        title="Kontrahenci"
        description="Dostawcy i odbiorcy — dane do dokumentów PZ, WZ i faktur"
        actions={canEdit && <Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>Nowy kontrahent</Button>}
      />
      <Card padded={false}>
        <div className="flex flex-wrap items-end justify-between gap-3 px-4 pt-2">
          <Tabs value={type} onChange={(v) => { setType(v); setPage(1); }} tabs={[{ value: '', label: 'Wszyscy' }, { value: 'SUPPLIER', label: 'Dostawcy' }, { value: 'CUSTOMER', label: 'Odbiorcy' }]} />
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Nazwa, NIP, miasto…" className="mb-2" />
        </div>
        <DataTable
          loading={isLoading}
          rows={data?.items}
          rowKey={(c) => c.id}
          onRowClick={canEdit ? (c) => setEditing(c) : undefined}
          rowClassName={(c) => (!c.active ? 'opacity-50' : undefined)}
          empty={<EmptyState icon={<Building2 className="size-6" />} title="Brak kontrahentów" />}
          columns={[
            { key: 'name', header: 'Nazwa', cell: (c) => <div><p className="font-medium">{c.name}</p>{c.email && <p className="text-xs text-slate-500">{c.email}</p>}</div> },
            { key: 'type', header: 'Rola', cell: (c) => <Badge tone={c.type === 'SUPPLIER' ? 'blue' : c.type === 'CUSTOMER' ? 'green' : 'violet'}>{CONTRACTOR_TYPE[c.type]}</Badge> },
            { key: 'nip', header: 'NIP', cell: (c) => <span className="font-mono text-xs">{c.nip ?? '—'}</span> },
            { key: 'addr', header: 'Adres', hideOnMobile: true, cell: (c) => <span className="text-sm text-slate-600">{[c.street, [c.postalCode, c.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '—'}</span> },
            { key: 'pay', header: 'Termin płatn.', align: 'right', hideOnMobile: true, cell: (c) => (c.paymentDays !== null && c.paymentDays !== undefined ? `${c.paymentDays} dni` : '—') },
          ]}
        />
        {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
      </Card>
      <ContractorModal contractor={editing} onClose={() => setEditing(null)} />
    </>
  );
}

const empty = { type: 'CUSTOMER' as ContractorType, name: '', shortName: '', nip: '', street: '', postalCode: '', city: '', email: '', phone: '', paymentDays: '14', active: true };

function ContractorModal({ contractor, onClose }: { contractor: Contractor | null | 'new'; onClose: () => void }) {
  const [f, setF] = useState(empty);
  const existing = contractor && contractor !== 'new' ? contractor : null;
  useEffect(() => {
    if (!contractor) return;
    setF(
      existing
        ? {
            type: existing.type, name: existing.name, shortName: existing.shortName ?? '', nip: existing.nip ?? '', street: existing.street ?? '',
            postalCode: existing.postalCode ?? '', city: existing.city ?? '', email: existing.email ?? '', phone: existing.phone ?? '',
            paymentDays: existing.paymentDays?.toString() ?? '', active: existing.active,
          }
        : empty,
    );
  }, [contractor, existing]);
  const save = useMutate(
    (body: object) => (existing ? api.patch(`/contractors/${existing.id}`, body) : api.post('/contractors', body)),
    { invalidate: [['contractors']], success: 'Zapisano kontrahenta', onSuccess: onClose },
  );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const { active, paymentDays, ...rest } = f;
    save.mutate({ ...rest, paymentDays: paymentDays ? Number(paymentDays) : undefined, ...(existing ? { active } : {}) });
  };
  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal open={!!contractor} onClose={onClose} title={existing ? existing.name : 'Nowy kontrahent'} size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Anuluj</Button><Button type="submit" form="contractor-form" loading={save.isPending}>Zapisz</Button></>}>
      <form id="contractor-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-6">
        <Field label="Rola" className="sm:col-span-2">
          <Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as ContractorType })}>
            {Object.entries(CONTRACTOR_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="Nazwa pełna" required className="sm:col-span-4"><Input value={f.name} onChange={set('name')} required /></Field>
        <Field label="NIP" className="sm:col-span-2"><Input value={f.nip} onChange={(e) => setF({ ...f, nip: e.target.value.replace(/\D/g, '') })} maxLength={10} className="font-mono" /></Field>
        <Field label="Nazwa skrócona" className="sm:col-span-2"><Input value={f.shortName} onChange={set('shortName')} /></Field>
        <Field label="Termin płatności (dni)" className="sm:col-span-2"><Input type="number" min={0} value={f.paymentDays} onChange={set('paymentDays')} /></Field>
        <Field label="Ulica i numer" className="sm:col-span-6"><Input value={f.street} onChange={set('street')} /></Field>
        <Field label="Kod pocztowy" className="sm:col-span-2"><Input value={f.postalCode} onChange={set('postalCode')} placeholder="00-000" /></Field>
        <Field label="Miejscowość" className="sm:col-span-4"><Input value={f.city} onChange={set('city')} /></Field>
        <Field label="E-mail" className="sm:col-span-3"><Input type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Telefon" className="sm:col-span-3"><Input value={f.phone} onChange={set('phone')} /></Field>
        {existing && <div className="sm:col-span-6"><Checkbox label="Aktywny" checked={f.active} onChange={(v) => setF({ ...f, active: v })} /></div>}
      </form>
    </Modal>
  );
}
