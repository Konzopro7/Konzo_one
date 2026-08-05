import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { Eye, EyeOff } from "lucide-react";
import { formatCurrency } from "../lib/format.js";
import { useAuth } from "../hooks/useAuth.jsx";

const initialLogin = { email: "", password: "" };
const initialRegister = {
  agencyName: "Konzotech Agency",
  fullName: "",
  email: "",
  password: "",
  planTier: "pro"
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
  if (!next.startsWith("/")) {
    return "/dashboard";
  }
  return next;
}

function PlanPill({ activePlan }) {
  const amount = activePlan === "premium"
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
  const logoSrc = `${import.meta.env.BASE_URL}logo.svg`;
  const redirectAfterAuth = useMemo(() => parseNext(searchParams), [searchParams]);
  const [mode, setMode] = useState(() => parseMode(searchParams));
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loginForm, setLoginForm] = useState(initialLogin);
  const [registerForm, setRegisterForm] = useState(() => ({
    ...initialRegister,
    planTier: parsePlan(searchParams)
  }));

  useEffect(() => {
    setMode(parseMode(searchParams));
    setRegisterForm((prev) => ({
      ...prev,
      planTier: parsePlan(searchParams)
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
            : "Action impossible.")
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-100 p-4">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(46,196,182,0.16),transparent_36%),radial-gradient(circle_at_80%_0%,rgba(11,60,93,0.24),transparent_38%)]" />
      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-panel lg:grid-cols-[1.1fr_0.9fr]">
        <section className="bg-gradient-to-br from-brand-700 via-brand-500 to-brand-600 p-8 text-white sm:p-10">
          <div className="inline-flex items-center gap-3 rounded-2xl border border-white/30 bg-white/10 px-4 py-3 backdrop-blur">
            <img
              src={logoSrc}
              alt="Konzotech Agency"
              width="40"
              height="40"
              className="h-10 w-10 rounded-xl object-contain"
            />
            <div>
              <p className="font-heading text-sm tracking-wide">KONZOTECH</p>
              <p className="text-[11px] tracking-[0.26em] text-blue-100">AGENCY</p>
            </div>
          </div>

          <h1 className="mt-8 font-heading text-3xl font-semibold leading-tight sm:text-4xl">
            Onboarde ton agence en quelques minutes.
          </h1>
          <p className="mt-4 max-w-md text-sm text-blue-100">
            Crée ton espace, teste gratuitement 30 jours et active ton plan quand tu veux.
          </p>

          {mode === "register" ? <PlanPill activePlan={registerForm.planTier} /> : null}

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/20 bg-white/10 p-4">
              <p className="text-xs text-blue-100">Automatisation</p>
              <p className="mt-1 text-xl font-semibold">Devis -&gt; Facture</p>
            </div>
            <div className="rounded-2xl border border-white/20 bg-white/10 p-4">
              <p className="text-xs text-blue-100">Monetisation</p>
              <p className="mt-1 text-xl font-semibold">Pro & Premium</p>
            </div>
          </div>
        </section>

        <section className="p-7 sm:p-10">
          <div className="mb-6 flex rounded-xl border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={[
                "flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition",
                mode === "login"
                  ? "bg-white text-brand-500 shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
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
                  : "text-slate-500 hover:text-slate-800"
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
                        agencyName: event.target.value
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
                        fullName: event.target.value
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
                        planTier: event.target.value === "premium" ? "premium" : "pro"
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
                className="field-input pr-12"
                value={mode === "login" ? loginForm.password : registerForm.password}
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
                aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                title={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              >
                {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
              </button>
              </div>
            </div>

            <button type="submit" className="btn-primary mt-2 w-full" disabled={loading}>
              {loading
                ? "Traitement..."
                : mode === "login"
                  ? "Entrer dans le dashboard"
                  : "Démarrer mon essai gratuit"}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-slate-500">
            Besoin de comparer les plans ?{" "}
            <Link to="/pricing" className="font-semibold text-brand-600 hover:underline">
              Voir la tarification
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}
