import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, Crown, Gem } from "lucide-react";
import toast from "react-hot-toast";
import api from "../lib/api.js";
import { formatCurrency, formatDate } from "../lib/format.js";
import { useAuth } from "../hooks/useAuth.jsx";

export default function BillingPage() {
  const { user, isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [processingPlan, setProcessingPlan] = useState("");
  const [status, setStatus] = useState(null);
  const confirmingSessionRef = useRef("");

  async function loadStatus() {
    const { data } = await api.get("/billing/status");
    setStatus(data);
  }

  useEffect(() => {
    let active = true;
    loadStatus()
      .catch(() => toast.error("Impossible de charger l'abonnement."))
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const billingResult = searchParams.get("billing");
    const sessionId = searchParams.get("session_id");

    if (billingResult === "cancelled") {
      toast.error("Paiement Stripe annulé.");
      setSearchParams({}, { replace: true });
      return;
    }

    if (billingResult !== "success" || !sessionId) {
      return;
    }

    if (confirmingSessionRef.current === sessionId) {
      return;
    }
    confirmingSessionRef.current = sessionId;

    api
      .post("/billing/confirm-checkout", { sessionId })
      .then(async () => {
        toast.success("Paiement confirmé. Ton abonnement est actif.");
        await loadStatus();
      })
      .catch((error) => {
        confirmingSessionRef.current = "";
        toast.error(error.response?.data?.message || "Confirmation du paiement impossible.");
      })
      .finally(() => setSearchParams({}, { replace: true }));
  }, [searchParams, setSearchParams]);

  const currentPlan = status?.subscription?.planTier || user?.subscription?.planTier || "pro";
  const subscriptionStatus =
    status?.subscription?.subscriptionStatus ||
    user?.subscription?.subscriptionStatus ||
    "trial";
  const trialDaysLeft =
    status?.subscription?.trialDaysLeft ?? user?.subscription?.trialDaysLeft ?? 0;
  const needsRenewal = ["canceled", "past_due"].includes(subscriptionStatus);

  function planActionLabel(planTier, label) {
    if (processingPlan === planTier) {
      return "Traitement...";
    }
    if (needsRenewal && currentPlan === planTier) {
      return `Renouveler ${label}`;
    }
    if (subscriptionStatus === "active" && currentPlan === planTier) {
      return "Plan actuel";
    }
    return `Choisir ${label}`;
  }

  const statusLabel = useMemo(() => {
    if (subscriptionStatus === "active") {
      return "Actif";
    }
    if (subscriptionStatus === "trial") {
      return `Essai gratuit (${trialDaysLeft} jour${trialDaysLeft > 1 ? "s" : ""})`;
    }
    if (subscriptionStatus === "past_due") {
      return "Paiement requis";
    }
    if (subscriptionStatus === "canceled") {
      return "Annulé";
    }
    return subscriptionStatus;
  }, [subscriptionStatus, trialDaysLeft]);

  async function startPlanCheckout(planTier) {
    if (!isAdmin) {
      toast.error("Seuls les admins peuvent gérer l'abonnement.");
      return;
    }

    setProcessingPlan(planTier);
    try {
      const { data } = await api.post("/billing/checkout-session", { planTier });

      if (data.checkoutUrl) {
        window.open(data.checkoutUrl, "_blank", "noopener,noreferrer");
        toast.success("Redirection vers Stripe.");
      } else if (data.simulated) {
        toast.success(
          needsRenewal
            ? "Abonnement renouvelé en mode local."
            : "Abonnement activé en mode local."
        );
        await loadStatus();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Activation de plan impossible.");
    } finally {
      setProcessingPlan("");
    }
  }

  async function simulateCancel() {
    if (!isAdmin) {
      return;
    }
    try {
      await api.post("/billing/simulate-cancel");
      toast.success("Abonnement annulé (simulation locale).");
      await loadStatus();
    } catch (error) {
      toast.error(error.response?.data?.message || "Action impossible.");
    }
  }

  if (loading) {
    return (
      <section className="card">
        <p className="text-sm text-slate-500">Chargement de la facturation...</p>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-xl font-semibold text-slate-900">
              Abonnement SaaS
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Gère tes plans Pro/Premium, ton essai gratuit 30 jours et la facturation mensuelle.
            </p>
          </div>
          <span
            className={[
              "rounded-full px-3 py-1 text-xs font-semibold",
              subscriptionStatus === "active"
                ? "bg-emerald-100 text-emerald-700"
                : subscriptionStatus === "trial"
                  ? "bg-brand-100 text-brand-700"
                  : "bg-amber-100 text-amber-700"
            ].join(" ")}
          >
            {statusLabel}
          </span>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="card">
          <p className="text-sm text-slate-500">Plan actuel</p>
          <p className="mt-2 font-heading text-2xl font-semibold text-slate-900">
            {currentPlan.toUpperCase()}
          </p>
        </article>
        <article className="card">
          <p className="text-sm text-slate-500">Essai gratuit restant</p>
          <p className="mt-2 font-heading text-2xl font-semibold text-slate-900">
            {trialDaysLeft} jour{trialDaysLeft > 1 ? "s" : ""}
          </p>
        </article>
        <article className="card">
          <p className="text-sm text-slate-500">Renouvellement / fin</p>
          <p className="mt-2 font-heading text-2xl font-semibold text-slate-900">
            {formatDate(status?.subscription?.subscriptionEndsAt)}
          </p>
        </article>
      </section>

      {status?.simulated && (
        <section className="card rounded-2xl border border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-800">
            Mode local : les plans sans identifiant de prix Stripe sont activés ou renouvelés en simulation.
          </p>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="card border border-brand-200">
          <div className="flex items-center justify-between">
            <h3 className="font-heading text-xl font-semibold text-slate-900">Plan Pro</h3>
            <Crown size={18} className="text-brand-600" />
          </div>
          <p className="mt-2 text-3xl font-semibold text-slate-900">
            {formatCurrency(status?.plans?.pro?.monthlyPrice || 49)} / mois
          </p>
          <ul className="mt-4 space-y-2 text-sm text-slate-600">
            <li className="flex items-center gap-2">
              <CheckCircle2 size={14} className="text-emerald-600" />
              Multi-utilisateurs agence
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 size={14} className="text-emerald-600" />
              Devis, factures, CRM, ERP de base
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 size={14} className="text-emerald-600" />
              Paiement Stripe + PDF pro
            </li>
          </ul>
          <button
            type="button"
            className="btn-primary mt-5 w-full"
            disabled={
              !isAdmin ||
              processingPlan === "pro" ||
              (subscriptionStatus === "active" && currentPlan === "pro")
            }
            onClick={() => startPlanCheckout("pro")}
          >
            {planActionLabel("pro", "Pro")}
          </button>
        </article>

        <article className="card border border-brand-500 bg-gradient-to-b from-brand-50 to-white">
          <div className="flex items-center justify-between">
            <h3 className="font-heading text-xl font-semibold text-slate-900">Plan Premium</h3>
            <Gem size={18} className="text-brand-600" />
          </div>
          <p className="mt-2 text-3xl font-semibold text-slate-900">
            {formatCurrency(status?.plans?.premium?.monthlyPrice || 99)} / mois
          </p>
          <ul className="mt-4 space-y-2 text-sm text-slate-600">
            <li className="flex items-center gap-2">
              <CheckCircle2 size={14} className="text-emerald-600" />
              Tout le plan Pro
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 size={14} className="text-emerald-600" />
              Capacité équipe et croissance avancées
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 size={14} className="text-emerald-600" />
              Priorité sur évolutions et support
            </li>
          </ul>
          <button
            type="button"
            className="btn-primary mt-5 w-full"
            disabled={
              !isAdmin ||
              processingPlan === "premium" ||
              (subscriptionStatus === "active" && currentPlan === "premium")
            }
            onClick={() => startPlanCheckout("premium")}
          >
            {planActionLabel("premium", "Premium")}
          </button>
        </article>
      </section>

      {status?.simulated && (
        <section className="card">
          <p className="text-xs text-slate-500">
            Mode simulation actif (local). Les abonnements sont appliqués sans Stripe.
          </p>
        </section>
      )}

      {import.meta.env.DEV && isAdmin && (
        <section className="card">
          <button type="button" className="btn-secondary" onClick={simulateCancel}>
            Simuler annulation abonnement (local)
          </button>
        </section>
      )}
    </div>
  );
}
