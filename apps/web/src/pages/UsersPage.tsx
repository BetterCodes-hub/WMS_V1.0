import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/api/client';
import type { Role, User } from '@/api/types';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Checkbox, Field, Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { DataTable } from '@/components/ui/Table';
import { useMutate } from '@/hooks/useMutate';
import { date } from '@/lib/format';
import { ROLE } from '@/lib/labels';

const PERMISSIONS: Record<Role, string> = {
  ADMIN: 'Pełny dostęp, zarządzanie użytkownikami',
  MANAGER: 'Kartoteki, procesy magazynowe, faktury, storno',
  OPERATOR: 'Przyjęcia, rozlokowanie, replenishment, wydania',
  ACCOUNTANT: 'Faktury, rozliczenia, eksporty; podgląd magazynu',
};

export default function UsersPage() {
  const [editing, setEditing] = useState<User | null | 'new'>(null);
  const { data, isLoading } = useQuery({ queryKey: ['users'], queryFn: () => api.get<User[]>('/users') });
  return (
    <>
      <PageHeader title="Użytkownicy" description="Konta i role — uprawnienia egzekwowane po stronie API" actions={<Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>Nowy użytkownik</Button>} />
      <Card padded={false}>
        <DataTable
          loading={isLoading}
          rows={data}
          rowKey={(u) => u.id}
          onRowClick={setEditing}
          rowClassName={(u) => (!u.active ? 'opacity-50' : undefined)}
          columns={[
            { key: 'name', header: 'Imię i nazwisko', cell: (u) => <div><p className="font-medium">{u.name}</p><p className="text-xs text-slate-500">{u.email}</p></div> },
            { key: 'role', header: 'Rola', cell: (u) => <Badge tone={u.role === 'ADMIN' ? 'violet' : u.role === 'MANAGER' ? 'indigo' : u.role === 'ACCOUNTANT' ? 'green' : 'gray'}>{ROLE[u.role]}</Badge> },
            { key: 'perm', header: 'Uprawnienia', hideOnMobile: true, cell: (u) => <span className="text-xs text-slate-500">{PERMISSIONS[u.role]}</span> },
            { key: 'status', header: 'Status', cell: (u) => (u.active ? <Badge tone="green" dot>aktywny</Badge> : <Badge dot>zablokowany</Badge>) },
            { key: 'created', header: 'Utworzono', hideOnMobile: true, cell: (u) => <span className="text-xs">{date(u.createdAt)}</span> },
          ]}
        />
      </Card>
      <UserModal user={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function UserModal({ user, onClose }: { user: User | null | 'new'; onClose: () => void }) {
  const existing = user && user !== 'new' ? user : null;
  const [f, setF] = useState({ email: '', name: '', role: 'OPERATOR' as Role, password: '', active: true });
  useEffect(() => {
    if (user) setF(existing ? { email: existing.email, name: existing.name, role: existing.role, password: '', active: existing.active ?? true } : { email: '', name: '', role: 'OPERATOR', password: '', active: true });
  }, [user, existing]);
  const save = useMutate(
    (body: object) => (existing ? api.patch(`/users/${existing.id}`, body) : api.post('/users', body)),
    { invalidate: [['users']], success: 'Zapisano użytkownika', onSuccess: onClose },
  );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const { password, active, ...rest } = f;
    save.mutate({ ...rest, ...(password ? { password } : {}), ...(existing ? { active } : {}) });
  };
  return (
    <Modal open={!!user} onClose={onClose} title={existing ? existing.name : 'Nowy użytkownik'} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Anuluj</Button><Button type="submit" form="user-form" loading={save.isPending}>Zapisz</Button></>}>
      <form id="user-form" onSubmit={submit} className="space-y-4">
        <Field label="Imię i nazwisko" required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
        <Field label="E-mail" required><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></Field>
        <Field label="Rola" hint={PERMISSIONS[f.role]}>
          <Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>
            {Object.entries(ROLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label={existing ? 'Nowe hasło' : 'Hasło'} hint={existing ? 'pozostaw puste, aby nie zmieniać' : 'min. 8 znaków'} required={!existing}>
          <Input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required={!existing} minLength={8} autoComplete="new-password" />
        </Field>
        {existing && <Checkbox label="Konto aktywne" checked={f.active} onChange={(v) => setF({ ...f, active: v })} />}
      </form>
    </Modal>
  );
}
