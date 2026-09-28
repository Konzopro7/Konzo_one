import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../lib/api.js";
import { PRODUCT_NAME } from "../../../shared/brand.mjs";
export default function NewsletterActionPage() {
  const { action } = useParams();
  const [token] = useState(
    () => new URLSearchParams(window.location.hash.slice(1)).get("token") || "",
  );
  const [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  useEffect(() => {
    window.history.replaceState(null, "", window.location.pathname);
  }, []);
  const valid =
    ["confirm", "unsubscribe"].includes(action) && /^[a-f0-9]{64}$/.test(token);
  async function submit() {
    if (lock.current || !valid) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await api.post(`/newsletter/${action}/token`, { token });
      setDone(true);
    } catch (error) {
      setError(
        error.response?.data?.message ||
          "La demande n’a pas abouti. Réessayez.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-8">
      <section className="card w-full max-w-xl">
        <p className="eyebrow">{PRODUCT_NAME}</p>
        <h1 className="mt-4 text-xl font-semibold">
          {action === "unsubscribe"
            ? "Désabonnement à la newsletter"
            : "Confirmer votre inscription à la newsletter"}
        </h1>
        {done ? (
          <p role="status" className="mt-4 text-sm text-teal-700">
            {action === "unsubscribe"
              ? "Votre désabonnement est enregistré. Vous ne recevrez plus notre newsletter."
              : "Votre inscription est confirmée. Si votre entreprise est éligible, la remise de 5 % sera appliquée automatiquement à son premier abonnement mensuel."}
          </p>
        ) : (
          <>
            <p className="mt-4 text-sm leading-6 text-slate-600">
              {action === "unsubscribe"
                ? "Confirmez votre choix pour arrêter la newsletter. Votre accès au CRM reste inchangé."
                : "Cliquez ci-dessous pour confirmer que vous souhaitez recevoir les nouveautés, conseils et offres de konzoCRM.com. Vous pourrez vous désabonner à tout moment."}
            </p>
            {!valid && (
              <p role="alert" className="mt-4 text-sm text-red-600">
                Ce lien est invalide. Demandez un nouveau lien dans les
                paramètres de votre compte.
              </p>
            )}
            {error && (
              <p role="alert" className="mt-4 text-sm text-red-600">
                {error}
              </p>
            )}
            <button
              type="button"
              className="btn-primary mt-5"
              disabled={busy || !valid}
              onClick={submit}
            >
              {busy
                ? "Enregistrement…"
                : action === "unsubscribe"
                  ? "Confirmer mon désabonnement"
                  : "Confirmer mon inscription"}
            </button>
          </>
        )}
        <div className="mt-5 flex flex-wrap gap-3">
          <Link className="btn-secondary" to="/settings">
            Ouvrir les paramètres
          </Link>
          <Link className="btn-secondary" to="/login">
            Me connecter
          </Link>
        </div>
      </section>
    </main>
  );
}
