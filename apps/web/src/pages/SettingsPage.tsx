import { useQuery } from '@tanstack/react-query';
import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/api/client';
import type { Company } from '@/api/types';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Field';
import { Spinner } from '@/components/ui/Feedback';
import { useMutate } from '@/hooks/useMutate';
import { useAuth } from '@/lib/auth';
import { ROLE } from '@/lib/labels';

export default function SettingsPage() {
  const { can, user } = useAuth();
  const { data } = useQuery({ queryKey: ['settings', 'company'], queryFn: () => api.get<Company>('/settings/company') });
  const [f, setF] = useState<Company | null>(null);
  useEffect(() => { if (data) setF(data); }, [data]);
  const save = useMutate((body: Company) => api.put('/settings/company', body), { invalidate: [['settings']], success: 'Zapisano dane firmy' });

  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', repeat: '' });
  const changePw = useMutate(() => api.post('/auth/change-password', { currentPassword: pw.currentPassword, newPassword: pw.newPassword }), {
    success: 'Hasło zostało zmienione',
    onSuccess: () => setPw({ currentPassword: '', newPassword: '', repeat: '' }),
  });

  if (!f) return <Spinner className="py-32" />;
  const editable = can('MANAGER', 'ACCOUNTANT');
  const set = (k: keyof Company) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const { name, nip, street, postalCode, city, bankAccount, bankName, email, phone, invoicePaymentDays, expiryWarningDays } = f;
    save.mutate({
      name, nip, street, postalCode, city,
      bankAccount: bankAccount || undefined, bankName: bankName || undefined, email: email || undefined, phone: phone || undefined,
      invoicePaymentDays: Number(invoicePaymentDays), expiryWarningDays: Number(expiryWarningDays),
    } as Company);
  };

  return (
    <>
      <PageHeader title="Ustawienia" description="Dane firmy na dokumentach oraz parametry systemu" />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card padded={false} className="xl:col-span-2">
          <CardHeader title="Dane firmy (sprzedawca)" description="Drukowane na fakturach, WZ i PZ" />
          <form onSubmit={submit} className="grid gap-4 p-5 sm:grid-cols-6">
            <fieldset disabled={!editable} className="contents">
              <Field label="Nazwa firmy" className="sm:col-span-4" required><Input value={f.name} onChange={set('name')} /></Field>
              <Field label="NIP" className="sm:col-span-2" required><Input value={f.nip} onChange={set('nip')} maxLength={10} className="font-mono" /></Field>
              <Field label="Ulica i numer" className="sm:col-span-6"><Input value={f.street} onChange={set('street')} /></Field>
              <Field label="Kod pocztowy" className="sm:col-span-2"><Input value={f.postalCode} onChange={set('postalCode')} /></Field>
              <Field label="Miejscowość" className="sm:col-span-4"><Input value={f.city} onChange={set('city')} /></Field>
              <Field label="Numer rachunku" className="sm:col-span-4"><Input value={f.bankAccount ?? ''} onChange={set('bankAccount')} className="font-mono" /></Field>
              <Field label="Bank" className="sm:col-span-2"><Input value={f.bankName ?? ''} onChange={set('bankName')} /></Field>
              <Field label="E-mail" className="sm:col-span-3"><Input value={f.email ?? ''} onChange={set('email')} /></Field>
              <Field label="Telefon" className="sm:col-span-3"><Input value={f.phone ?? ''} onChange={set('phone')} /></Field>
              <Field label="Domyślny termin płatności (dni)" className="sm:col-span-3"><Input type="number" min={0} value={f.invoicePaymentDays} onChange={set('invoicePaymentDays')} /></Field>
              <Field label="Ostrzeżenie o terminie ważności (dni)" className="sm:col-span-3"><Input type="number" min={1} value={f.expiryWarningDays} onChange={set('expiryWarningDays')} /></Field>
            </fieldset>
            {editable && <div className="flex justify-end sm:col-span-6"><Button type="submit" loading={save.isPending}>Zapisz</Button></div>}
          </form>
        </Card>
        <Card padded={false}>
          <CardHeader title="Moje konto" description={user && `${user.email} · ${ROLE[user.role]}`} />
          <form
            className="space-y-4 p-5"
            onSubmit={(e) => { e.preventDefault(); changePw.mutate(); }}
          >
            <Field label="Aktualne hasło"><Input type="password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} autoComplete="current-password" /></Field>
            <Field label="Nowe hasło" hint="min. 8 znaków"><Input type="password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} autoComplete="new-password" /></Field>
            <Field label="Powtórz nowe hasło" error={pw.repeat && pw.repeat !== pw.newPassword ? 'Hasła nie są zgodne' : undefined}>
              <Input type="password" value={pw.repeat} onChange={(e) => setPw({ ...pw, repeat: e.target.value })} autoComplete="new-password" />
            </Field>
            <Button type="submit" variant="secondary" className="w-full" loading={changePw.isPending} disabled={!pw.currentPassword || pw.newPassword.length < 8 || pw.newPassword !== pw.repeat}>
              Zmień hasło
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}
