import { PRODUCT_NAME } from "../../../shared/brand.mjs";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Suspense, useMemo, useState } from "react";
import Sidebar from "./Sidebar.jsx";
import Topbar from "./Topbar.jsx";
import WelcomeGuide from "../components/WelcomeGuide.jsx";
import { TourProvider } from "../hooks/useTour.jsx";
import { useAuth } from "../hooks/useAuth.jsx";

const pageTitles = {
  "/guide": "Guide de prise en main",
  "/profile": "Mon profil",
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
  "/guide": "Des étapes simples pour prendre vos repères et travailler efficacement.",
  "/profile": "Votre identité personnelle et vos informations de compte.",
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
  const {user}=useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const subscription = user?.subscription;
  const billingRequired = subscription && (['past_due','canceled'].includes(subscription.subscriptionStatus) ||
    (subscription.subscriptionStatus === 'trial' && !(new Date(subscription.trialEndsAt).getTime() > Date.now())));
  const accountPage = ["/profile","/billing","/platform","/guide"].includes(location.pathname);

  const title = useMemo(
    () => pageTitles[location.pathname] || PRODUCT_NAME,
    [location.pathname],
  );

  return (
    <TourProvider><div className="app-shell min-h-screen">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="min-h-screen lg:pl-[252px]">
        <Topbar onOpenSidebar={() => setSidebarOpen(true)} />
        <main className="page-content px-4 py-6 sm:px-7 lg:px-9">
          <div className="page-heading mb-7" data-tour="page-heading">
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-slate-900">
              {title}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {pageDescriptions[location.pathname] ||
                "Un espace pour organiser votre activité et avancer ensemble."}
            </p>
          </div>
          <Suspense fallback={<section className="card"><p className="text-sm text-slate-500">Chargement de la page…</p></section>}>
            {user?.subscription?.isSuspended && !accountPage ? <section className="card"><p role="alert" className="text-sm text-red-600">Votre entreprise est suspendue. Contactez l’administrateur de la plateforme pour rétablir l’accès.</p></section> : billingRequired && !accountPage ? <section className="card"><p role="alert" className="text-sm text-slate-600">Votre essai est terminé ou votre abonnement est inactif. Activez un abonnement pour retrouver l’accès au CRM. Vos données sont conservées.</p><Link to="/billing" className="btn-primary mt-4">Gérer mon abonnement</Link></section> : <Outlet />}
          </Suspense>
        </main>
      </div>
      <WelcomeGuide />
    </div></TourProvider>
  );
}
