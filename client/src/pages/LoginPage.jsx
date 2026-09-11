import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  Eye,
  EyeOff,
  ArrowUpRight,
  ArrowRight,
  Layers,
  Check,
  FileText,
  Users,
  Receipt,
  ShieldCheck,
} from "lucide-react";
import { formatCurrency } from "../lib/format.js";
import { useAuth } from "../hooks/useAuth.jsx";

const initialLogin = { email: "", password: "" };
const initialRegister = {
  agencyName: "Konzotech Agency",
  fullName: "",
  email: "",
  password: "",
  planTier: "pro",
};

function parseMode(searchParams) {
  const mode = String(searchParams.get("mode") || "").toLowerCase();
  return mode === "register" ? "register" : "login";
}

function parsePlan(searchParams) {
  const plan = String(searchParams.get("plan") || "").toLowerCase();
  return plan === "premium" ? "premium" : "pro";
}

function parseNext(searchParams) {
  const next = String(searchParams.get("next") || "").trim();
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return "/dashboard";
  }
  return next;
}

function PlanPill({ activePlan }) {
  const amount =
    activePlan === "premium"
      ? Number(import.meta.env.VITE_PLAN_PRICE_PREMIUM_MONTHLY || 99)
      : Number(import.meta.env.VITE_PLAN_PRICE_PRO_MONTHLY || 49);

  return (
    <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm">
      <p className="text-blue-100">Plan sélectionné</p>
      <p className="mt-1 font-semibold text-white">
        {activePlan.toUpperCase()} - {formatCurrency(amount)}/mois
      </p>
      <p className="text-xs text-blue-100">Essai gratuit 30 jours inclus</p>
    </div>
  );
}

export default function LoginPage() {
  const { isAuthenticated, login, register } = useAuth();
  const [searchParams] = useSearchParams();
  const redirectAfterAuth = useMemo(
    () => parseNext(searchParams),
    [searchParams],
  );
  const [mode, setMode] = useState(() => parseMode(searchParams));
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loginForm, setLoginForm] = useState(initialLogin);
  const [registerForm, setRegisterForm] = useState(() => ({
    ...initialRegister,
    planTier: parsePlan(searchParams),
  }));

  useEffect(() => {
    setMode(parseMode(searchParams));
    setRegisterForm((prev) => ({
      ...prev,
      planTier: parsePlan(searchParams),
    }));
  }, [searchParams]);

  if (isAuthenticated) {
    return <Navigate to={redirectAfterAuth} replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    try {
      if (mode === "login") {
        await login(loginForm);
        toast.success("Connexion réussie.");
      } else {
        await register(registerForm);
        toast.success("Compte créé avec succès.");
      }
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          (error.request
            ? "API inaccessible. Vérifie que le serveur local est démarré."
            : "Action impossible."),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-shell">
        <section className="auth-story">
          <Link to="/pricing" className="auth-brand">
            <span className="brand-mark">
              <Layers size={25} />
            </span>
            <span>
              Konzotech <strong>One</strong>
            </span>
          </Link>
          <div className="auth-story-copy">
            <span className="auth-kicker">
              LE QUOTIDIEN DE VOTRE AGENCE, SIMPLIFIÉ
            </span>
            <h1>
              Moins de gestion.
              <br />
              <span>Plus de relations.</span>
            </h1>
            <p>
              Clients, devis et finances : retrouvez l’essentiel dans un espace
              pensé pour faire avancer votre agence.
            </p>
          </div>
          <div
            className="auth-workflow"
            aria-label="Du premier contact au paiement"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-300">
                Un parcours. Tout est connecté.
              </p>
              <ArrowUpRight size={18} className="text-teal-300" />
            </div>
            <div className="workflow-steps">
              {[
                [Users, "Client", "Une relation"],
                [FileText, "Devis", "Une proposition"],
                [Receipt, "Facture", "Un résultat"],
              ].map(([Icon, label, detail], index) => (
                <div className="workflow-step" key={label}>
                  <span>
                    <Icon size={22} />
                  </span>
                  <strong>{label}</strong>
                  <small>{detail}</small>
                  {index < 2 && (
                    <ArrowRight className="workflow-arrow" size={16} />
                  )}
                </div>
              ))}
            </div>
            <div className="workflow-footer">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-300" />
              Votre activité, du premier échange au paiement.
            </div>
          </div>
          {mode === "register" && (
            <PlanPill activePlan={registerForm.planTier} />
          )}
          <div className="auth-benefits">
            <span>
              <Check size={15} />
              30 jours d’essai
            </span>
            <span>
              <Check size={15} />
              Un espace pour toute l’équipe
            </span>
          </div>
          <p className="auth-story-footer">
            KONZOTECH ONE <span>CRM & gestion d’agence</span>
          </p>
        </section>

        <section className="auth-form-panel">
          <div className="mb-8">
            <span className="eyebrow">VOTRE ESPACE PROFESSIONNEL</span>
            <h2 className="mt-3 font-heading text-3xl font-semibold tracking-tight text-slate-900">
              {mode === "login"
                ? "Heureux de vous revoir."
                : "Votre prochaine étape."}
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              {mode === "login"
                ? "Connectez-vous pour retrouver votre équipe et vos projets."
                : "Créez votre espace et découvrez une nouvelle façon de travailler."}
            </p>
          </div>

          <div className="mb-6 flex rounded-xl border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={[
                "flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition",
                mode === "login"
                  ? "bg-white text-brand-500 shadow-sm"
                  : "text-slate-500 hover:text-slate-800",
              ].join(" ")}
            >
              Connexion
            </button>
            <button
              type="button"
              onClick={() => setMode("register")}
              className={[
                "flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition",
                mode === "register"
                  ? "bg-white text-brand-500 shadow-sm"
                  : "text-slate-500 hover:text-slate-800",
              ].join(" ")}
            >
              Créer un compte
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <>
                <div>
                  <label className="field-label">Nom de l'agence</label>
                  <input
                    className="field-input"
                    value={registerForm.agencyName}
                    onChange={(event) =>
                      setRegisterForm((prev) => ({
                        ...prev,
                        agencyName: event.target.value,
                      }))
                    }
                    required
                  />
                </div>
                <div>
                  <label className="field-label">Nom complet</label>
                  <input
                    className="field-input"
                    value={registerForm.fullName}
                    onChange={(event) =>
                      setRegisterForm((prev) => ({
                        ...prev,
                        fullName: event.target.value,
                      }))
                    }
                    required
                  />
                </div>
                <div>
                  <label className="field-label">Plan cible après essai</label>
                  <select
                    className="field-input"
                    value={registerForm.planTier}
                    onChange={(event) =>
                      setRegisterForm((prev) => ({
                        ...prev,
                        planTier:
                          event.target.value === "premium" ? "premium" : "pro",
                      }))
                    }
                  >
                    <option value="pro">Pro</option>
                    <option value="premium">Premium</option>
                  </select>
                </div>
              </>
            )}

            <div>
              <label className="field-label">Email professionnel</label>
              <input
                type="email"
                autoComplete="email"
                placeholder="vous@agence.ca"
                aria-label="Email professionnel"
                className="field-input"
                value={mode === "login" ? loginForm.email : registerForm.email}
                onChange={(event) => {
                  const value = event.target.value;
                  if (mode === "login") {
                    setLoginForm((prev) => ({ ...prev, email: value }));
                  } else {
                    setRegisterForm((prev) => ({ ...prev, email: value }));
                  }
                }}
                required
              />
            </div>

            <div>
              <label className="field-label">Mot de passe</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  aria-label="Mot de passe"
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  placeholder="Votre mot de passe"
                  className="field-input pr-12"
                  value={
                    mode === "login"
                      ? loginForm.password
                      : registerForm.password
                  }
                  onChange={(event) => {
                    const value = event.target.value;
                    if (mode === "login") {
                      setLoginForm((prev) => ({ ...prev, password: value }));
                    } else {
                      setRegisterForm((prev) => ({ ...prev, password: value }));
                    }
                  }}
                  minLength={mode === "register" ? 8 : 1}
                  required
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 transition hover:text-brand-600"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={
                    showPassword
                      ? "Masquer le mot de passe"
                      : "Afficher le mot de passe"
                  }
                  title={
                    showPassword
                      ? "Masquer le mot de passe"
                      : "Afficher le mot de passe"
                  }
                >
                  {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn-primary mt-2 w-full"
              disabled={loading}
            >
              {loading
                ? "Traitement..."
                : mode === "login"
                  ? "Accéder à mon espace"
                  : "Démarrer mon essai gratuit"}
            </button>
          </form>

          <p className="mt-5 flex items-center justify-center gap-2 text-xs text-slate-400">
            <ShieldCheck size={14} />
            Un accès personnel à votre espace de travail
          </p>
          <p className="mt-4 text-center text-xs text-slate-500">
            Besoin de comparer les plans ?{" "}
            <Link
              to="/pricing"
              className="font-semibold text-brand-600 hover:underline"
            >
              Voir la tarification
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}
