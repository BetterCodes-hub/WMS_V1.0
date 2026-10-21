import { Boxes, PackageCheck, Truck, Warehouse } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Feedback';
import { useAuth } from '@/lib/auth';

const DEMO = [
  { email: 'admin@wms.local', password: 'admin123', label: 'Administrator' },
  { email: 'kierownik@wms.local', password: 'demo1234', label: 'Kierownik' },
  { email: 'magazynier@wms.local', password: 'demo1234', label: 'Magazynier' },
  { email: 'ksiegowa@wms.local', password: 'demo1234', label: 'Księgowa' },
];

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('admin@wms.local');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-slate-900 p-12 text-white lg:flex">
        <div className="absolute -top-32 -right-32 size-96 rounded-full bg-brand-600/30 blur-3xl" />
        <div className="absolute -bottom-40 -left-20 size-96 rounded-full bg-sky-500/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="rounded-xl bg-brand-600 p-2">
            <Warehouse className="size-6" />
          </div>
          <span className="text-lg font-semibold">WMS</span>
        </div>
        <div className="relative space-y-8">
          <h1 className="text-4xl leading-tight font-semibold tracking-tight">
            Pełna kontrola nad magazynem — od rampy po fakturę.
          </h1>
          <ul className="space-y-4 text-slate-300">
            {[
              [<PackageCheck key="a" />, 'Przyjęcia na sztuki i palety, palety matczyne z kartonami, etykiety SSCC'],
              [<Boxes key="b" />, 'Alerty stanów minimalnych i replenishment miejsc kompletacji'],
              [<Truck key="c" />, 'Wydania WZ wg FEFO, faktury VAT i rozliczenia dla księgowości'],
            ].map(([icon, text], i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="mt-0.5 rounded-lg bg-white/10 p-1.5 [&_svg]:size-4">{icon}</span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-slate-500">Projekt portfolio · NestJS · Prisma · PostgreSQL · React</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <div className="rounded-lg bg-brand-600 p-1.5 text-white">
              <Warehouse className="size-5" />
            </div>
            <span className="font-semibold">WMS</span>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">Zaloguj się</h2>
          <p className="mt-1 text-sm text-slate-500">Wybierz konto demonstracyjne lub wpisz dane.</p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            {error && <Notice tone="danger">{error}</Notice>}
            <Field label="E-mail">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
            </Field>
            <Field label="Hasło">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            </Field>
            <Button type="submit" size="lg" className="w-full" loading={busy}>
              Zaloguj
            </Button>
          </form>

          <div className="mt-8">
            <p className="mb-2 text-xs font-medium text-slate-500">Konta demonstracyjne</p>
            <div className="grid grid-cols-2 gap-2">
              {DEMO.map((d) => (
                <button
                  key={d.email}
                  onClick={() => {
                    setEmail(d.email);
                    setPassword(d.password);
                  }}
                  className={`rounded-lg border px-3 py-2 text-left text-xs transition ${
                    email === d.email ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <span className="block font-medium">{d.label}</span>
                  <span className="text-slate-500">{d.email}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
