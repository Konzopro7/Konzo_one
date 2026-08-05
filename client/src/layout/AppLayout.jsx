import { Outlet, useLocation } from "react-router-dom";
import { useMemo, useState } from "react";
import Sidebar from "./Sidebar.jsx";
import Topbar from "./Topbar.jsx";

const pageTitles = {
  "/dashboard": "Tableau de bord",
  "/pipeline": "Pipeline commercial",
  "/billing": "Abonnement et plans",
  "/quotes": "Gestion des devis",
  "/invoices": "Gestion des factures",
  "/clients": "Gestion des clients",
  "/messages": "Messages WhatsApp",
  "/purchases": "Achats fournisseurs",
  "/inventory": "Stock ERP",
  "/expenses": "Dépenses",
  "/ledger": "Grand livre simplifié",
  "/platform": "Console admin plateforme",
  "/activity": "Journal d'activité",
  "/team": "Équipe et rôles",
  "/settings": "Paramètres de l'agence"
};

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  const title = useMemo(
    () => pageTitles[location.pathname] || "Konzotech One",
    [location.pathname]
  );

  return (
    <div className="min-h-screen bg-slate-100 bg-dashboard-grid [background-size:18px_18px]">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="min-h-screen lg:pl-72">
        <Topbar onOpenSidebar={() => setSidebarOpen(true)} />
        <main className="px-4 py-5 sm:px-6 lg:px-8">
          <div className="mb-5">
            <h1 className="font-heading text-2xl font-semibold text-slate-900">{title}</h1>
            <p className="mt-1 text-sm text-slate-500">
              Konzotech One, espace interne de Konzotech Agency pour piloter opérations et finance.
            </p>
          </div>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
