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
  "/settings": "Paramètres de l'agence",
};

const pageDescriptions = {
  "/dashboard": "Votre activité en un regard. Gardez le cap sur ce qui compte.",
  "/clients": "Des relations durables commencent par un suivi attentif.",
  "/pipeline": "Transformez vos opportunités en nouvelles collaborations.",
  "/quotes": "Des propositions claires, du premier échange à la signature.",
  "/invoices":
    "Suivez votre facturation et gardez la maîtrise de vos encaissements.",
  "/settings":
    "Un espace à votre image, des préférences adaptées à votre agence.",
  "/messages": "Chaque conversation client, au même endroit.",
  "/billing": "Le bon plan pour la prochaine étape de votre agence.",
};
export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  const title = useMemo(
    () => pageTitles[location.pathname] || "Konzotech One",
    [location.pathname],
  );

  return (
    <div className="app-shell min-h-screen">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="min-h-screen lg:pl-[252px]">
        <Topbar onOpenSidebar={() => setSidebarOpen(true)} />
        <main className="page-content px-4 py-6 sm:px-7 lg:px-9">
          <div className="page-heading mb-7">
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-slate-900">
              {title}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {pageDescriptions[location.pathname] ||
                "Un espace pour organiser votre activité et avancer ensemble."}
            </p>
          </div>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
