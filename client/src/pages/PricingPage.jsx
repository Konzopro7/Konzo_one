import { Check, Rocket, ShieldCheck, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { formatCurrency } from "../lib/format.js";

const plans = [
  {
    id: "pro",
    label: "Pro",
    price: Number(import.meta.env.VITE_PLAN_PRICE_PRO_MONTHLY || 49),
    highlight: false,
    subtitle: "Idéal pour lancer et structurer une agence digitale",
    features: [
      "Essai gratuit 30 jours",
      "Devis, factures, clients",
      "Gestion équipe (admin + commerciaux)",
      "PDF professionnels + suivi relances",
      "Paiement en ligne Stripe"
    ]
  },
  {
    id: "premium",
    label: "Premium",
    price: Number(import.meta.env.VITE_PLAN_PRICE_PREMIUM_MONTHLY || 99),
    highlight: true,
    subtitle: "Pour scaler avec plus de pilotage et d'automatisation",
    features: [
      "Tout le plan Pro",
      "Module ERP et stock avancé",
      "Grand livre et exports financiers",
      "Workflows commerciaux renforcés",
      "Priorité support et évolutions"
    ]
  }
];

function PlanCard({ plan }) {
  const startUrl = `/login?mode=register&plan=${plan.id}&next=/billing`;

  return (
    <article
      className={[
        "relative rounded-3xl border bg-white p-6 shadow-soft transition-all",
        plan.highlight
          ? "border-brand-400 ring-2 ring-brand-100"
          : "border-slate-200 hover:border-brand-200"
      ].join(" ")}
    >
      {plan.highlight && (
        <span className="absolute right-4 top-4 rounded-full bg-brand-500 px-3 py-1 text-xs font-semibold text-white">
          Le plus choisi
        </span>
      )}

      <h3 className="font-heading text-2xl font-semibold text-slate-900">{plan.label}</h3>
      <p className="mt-1 text-sm text-slate-500">{plan.subtitle}</p>

      <p className="mt-5 font-heading text-4xl font-semibold text-slate-900">
        {formatCurrency(plan.price)}
        <span className="ml-1 text-base font-medium text-slate-500">/mois</span>
      </p>

      <ul className="mt-5 space-y-2">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-center gap-2 text-sm text-slate-700">
            <Check size={14} className="text-emerald-600" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <Link to={startUrl} className="btn-primary mt-6 w-full justify-center">
        Démarrer l'essai gratuit
      </Link>
    </article>
  );
}

export default function PricingPage() {
  const logoSrc = `${import.meta.env.BASE_URL}logo.svg`;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <img
              src={logoSrc}
              alt="Konzotech Agency"
              width="40"
              height="40"
              className="h-10 w-10 rounded-xl object-contain"
            />
            <div>
              <p className="font-heading text-sm tracking-wide text-slate-900">KONZOTECH ONE</p>
              <p className="text-[11px] tracking-[0.26em] text-slate-500">DIGITAL OS</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link to="/login?mode=login&next=/dashboard" className="btn-secondary">
              Connexion
            </Link>
            <Link to="/login?mode=register&plan=premium&next=/billing" className="btn-primary">
              Essai gratuit
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-14 pt-12 sm:px-6">
        <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-brand-700 via-brand-600 to-brand-500 p-8 text-white shadow-soft sm:p-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(46,196,182,0.28),transparent_36%)]" />
          <div className="relative">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
              <Sparkles size={13} />
              SaaS moderne pour agences
            </p>
            <h1 className="mt-4 max-w-3xl font-heading text-4xl font-semibold leading-tight sm:text-5xl">
              Gère ton agence digitale comme un vrai SaaS premium.
            </h1>
            <p className="mt-4 max-w-2xl text-sm text-blue-50 sm:text-base">
              Devis, factures, ERP, équipe et paiements en ligne dans une plateforme unique.
              Commence avec 30 jours d'essai gratuit, sans engagement.
            </p>
            <div className="mt-7 flex flex-wrap gap-2">
              <Link
                to="/login?mode=register&plan=pro&next=/billing"
                className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-brand-700 transition hover:bg-blue-50"
              >
                <Rocket size={15} />
                Démarrer maintenant
              </Link>
              <Link
                to="/login?mode=login&next=/dashboard"
                className="inline-flex items-center gap-2 rounded-xl border border-white/35 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
              >
                <ShieldCheck size={15} />
                J'ai déjà un compte
              </Link>
            </div>
          </div>
        </section>

        <section className="mt-8">
          <div className="mb-5">
            <h2 className="font-heading text-3xl font-semibold text-slate-900">Tarification simple</h2>
            <p className="mt-2 text-sm text-slate-600">
              Choisis ton niveau, active l'essai gratuit puis passe en abonnement mensuel.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {plans.map((plan) => (
              <PlanCard key={plan.id} plan={plan} />
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="font-heading text-xl font-semibold text-slate-900">Onboarding client complet</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Étape 1</p>
              <p className="mt-2 text-sm font-medium text-slate-800">Création compte agence</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Étape 2</p>
              <p className="mt-2 text-sm font-medium text-slate-800">Essai gratuit 30 jours</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Étape 3</p>
              <p className="mt-2 text-sm font-medium text-slate-800">Activation Pro/Premium</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
