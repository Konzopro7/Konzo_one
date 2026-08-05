import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import AppLayout from "./layout/AppLayout.jsx";

const BillingPage = lazy(() => import("./pages/BillingPage.jsx"));
const ClientsPage = lazy(() => import("./pages/ClientsPage.jsx"));
const DashboardPage = lazy(() => import("./pages/DashboardPage.jsx"));
const ExpensesPage = lazy(() => import("./pages/ExpensesPage.jsx"));
const InventoryPage = lazy(() => import("./pages/InventoryPage.jsx"));
const InvoicesPage = lazy(() => import("./pages/InvoicesPage.jsx"));
const LedgerPage = lazy(() => import("./pages/LedgerPage.jsx"));
const LoginPage = lazy(() => import("./pages/LoginPage.jsx"));
const MessagesPage = lazy(() => import("./pages/MessagesPage.jsx"));
const PlatformAdminPage = lazy(() => import("./pages/PlatformAdminPage.jsx"));
const PipelinePage = lazy(() => import("./pages/PipelinePage.jsx"));
const PricingPage = lazy(() => import("./pages/PricingPage.jsx"));
const PurchasesPage = lazy(() => import("./pages/PurchasesPage.jsx"));
const QuotesPage = lazy(() => import("./pages/QuotesPage.jsx"));
const SettingsPage = lazy(() => import("./pages/SettingsPage.jsx"));
const TeamPage = lazy(() => import("./pages/TeamPage.jsx"));
const ActivityPage = lazy(() => import("./pages/ActivityPage.jsx"));
const ClientPortalPage = lazy(() => import("./pages/ClientPortalPage.jsx"));

function RouteLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100">
      <div className="rounded-2xl bg-white px-8 py-6 shadow-soft">
        <p className="font-heading text-brand-500">Chargement de votre espace...</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<RouteLoader />}>
      <Routes>
        <Route path="/" element={<PricingPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/portal/:type/:token" element={<ClientPortalPage />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/pipeline" element={<PipelinePage />} />
            <Route path="/quotes" element={<QuotesPage />} />
            <Route path="/invoices" element={<InvoicesPage />} />
            <Route path="/clients" element={<ClientsPage />} />
            <Route path="/messages" element={<MessagesPage />} />
            <Route path="/purchases" element={<PurchasesPage />} />
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/expenses" element={<ExpensesPage />} />
            <Route path="/ledger" element={<LedgerPage />} />
            <Route path="/billing" element={<BillingPage />} />
            <Route path="/platform" element={<PlatformAdminPage />} />
            <Route path="/activity" element={<ActivityPage />} />
            <Route path="/team" element={<TeamPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/pricing" replace />} />
      </Routes>
    </Suspense>
  );
}
