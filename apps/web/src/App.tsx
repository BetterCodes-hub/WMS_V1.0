import { lazy, ReactNode, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import type { Role } from './api/types';
import { Spinner } from './components/ui/Feedback';
import { AppLayout } from './layout/AppLayout';
import { useAuth } from './lib/auth';
import { LoginPage } from './pages/LoginPage';

const Dashboard = lazy(() => import('./pages/DashboardPage'));
const Products = lazy(() => import('./pages/products/ProductsPage'));
const ProductDetail = lazy(() => import('./pages/products/ProductDetailPage'));
const Locations = lazy(() => import('./pages/locations/LocationsPage'));
const LocationDetail = lazy(() => import('./pages/locations/LocationDetailPage'));
const Inventory = lazy(() => import('./pages/inventory/InventoryPage'));
const Movements = lazy(() => import('./pages/inventory/MovementsPage'));
const Pallets = lazy(() => import('./pages/pallets/PalletsPage'));
const PalletDetail = lazy(() => import('./pages/pallets/PalletDetailPage'));
const Receipts = lazy(() => import('./pages/receipts/ReceiptsPage'));
const ReceiptForm = lazy(() => import('./pages/receipts/ReceiptFormPage'));
const ReceiptDetail = lazy(() => import('./pages/receipts/ReceiptDetailPage'));
const Replenishment = lazy(() => import('./pages/replenishment/ReplenishmentPage'));
const Issues = lazy(() => import('./pages/issues/IssuesPage'));
const IssueForm = lazy(() => import('./pages/issues/IssueFormPage'));
const IssueDetail = lazy(() => import('./pages/issues/IssueDetailPage'));
const Alerts = lazy(() => import('./pages/AlertsPage'));
const Invoices = lazy(() => import('./pages/invoices/InvoicesPage'));
const InvoiceDetail = lazy(() => import('./pages/invoices/InvoiceDetailPage'));
const InvoiceForm = lazy(() => import('./pages/invoices/InvoiceFormPage'));
const Accounting = lazy(() => import('./pages/invoices/AccountingPage'));
const Contractors = lazy(() => import('./pages/ContractorsPage'));
const Users = lazy(() => import('./pages/UsersPage'));
const Settings = lazy(() => import('./pages/SettingsPage'));

function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { can } = useAuth();
  return can(...roles) ? children : <Navigate to="/" replace />;
}

export function App() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner className="py-40" />;
  if (!user) return <LoginPage />;

  return (
    <Suspense fallback={<Spinner className="py-40" />}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="products" element={<Products />} />
          <Route path="products/:id" element={<ProductDetail />} />
          <Route path="locations" element={<Locations />} />
          <Route path="locations/:id" element={<LocationDetail />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="movements" element={<Movements />} />
          <Route path="pallets" element={<Pallets />} />
          <Route path="pallets/:id" element={<PalletDetail />} />
          <Route path="receipts" element={<Receipts />} />
          <Route path="receipts/new" element={<ReceiptForm />} />
          <Route path="receipts/:id" element={<ReceiptDetail />} />
          <Route path="replenishment" element={<Replenishment />} />
          <Route path="issues" element={<Issues />} />
          <Route path="issues/new" element={<IssueForm />} />
          <Route path="issues/:id/edit" element={<IssueForm />} />
          <Route path="issues/:id" element={<IssueDetail />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="invoices" element={<RequireRole roles={['MANAGER', 'ACCOUNTANT']}><Invoices /></RequireRole>} />
          <Route path="invoices/new" element={<RequireRole roles={['MANAGER', 'ACCOUNTANT']}><InvoiceForm /></RequireRole>} />
          <Route path="invoices/:id" element={<RequireRole roles={['MANAGER', 'ACCOUNTANT']}><InvoiceDetail /></RequireRole>} />
          <Route path="accounting" element={<RequireRole roles={['MANAGER', 'ACCOUNTANT']}><Accounting /></RequireRole>} />
          <Route path="contractors" element={<Contractors />} />
          <Route path="users" element={<RequireRole roles={['ADMIN']}><Users /></RequireRole>} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
