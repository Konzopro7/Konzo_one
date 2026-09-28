import { useEffect, useRef, useState } from "react";
import { Mail } from "lucide-react";
import api from "../lib/api.js";
import { useAuth } from "../hooks/useAuth.jsx";
import {
  NEWSLETTER_CONSENT_TEXT,
  NEWSLETTER_OFFER_TEXT,
} from "../../../shared/newsletter.mjs";

export default function NewsletterSection({ prompt = false }) {
  const { user } = useAuth();
  const [status, setStatus] = useState(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  useEffect(() => {
    let active = true;
    api
      .get("/newsletter/status")
      .then(({ data }) => {
        if (active) setStatus(data);
      })
      .catch(() => {
        if (active)
          setError("Impossible de charger vos préférences newsletter.");
      });
    return () => {
      active = false;
    };
  }, [user?.id]);
  async function action(path, body) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { data } = await api.post(`/newsletter/${path}`, body);
      if (path === "dismiss")
        setStatus((current) => ({ ...current, promptDismissed: true }));
      else {
        setStatus(data);
        setConsent(false);
        setMessage(data.message);
      }
    } catch (error) {
      setError(
        error.response?.data?.message ||
          "Votre choix n’a pas pu être enregistré. Réessayez.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function refresh() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const { data } = await api.get("/newsletter/status");
      setStatus(data);
      setMessage(
        data.status === "subscribed"
          ? "Votre inscription est confirmée."
          : "La confirmation par email est encore attendue.",
      );
    } catch {
      setError("Impossible de vérifier votre inscription.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (
    prompt &&
    (!status ||
      status.promptDismissed ||
      status.status === "subscribed" ||
      user?.needsWelcomeGuide)
  )
    return null;
  return (
    <section
      className="card mb-6"
      aria-labelledby={
        prompt ? "newsletter-prompt-title" : "newsletter-settings-title"
      }
    >
      <div className="section-intro">
        <span className="section-icon">
          <Mail size={20} />
        </span>
        <div>
          <h2
            id={
              prompt ? "newsletter-prompt-title" : "newsletter-settings-title"
            }
          >
            {prompt
              ? "Newsletter : 5 % sur le premier mois"
              : "Newsletter konzoCRM.com"}
          </h2>
          <p>
            Nouveautés, conseils pour utiliser votre CRM et offres de notre
            équipe.
          </p>
        </div>
      </div>
      {!status && !error && (
        <p className="text-sm text-slate-500">Chargement de vos préférences…</p>
      )}
      {status && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Adresse de votre compte :{" "}
            <strong className="break-all">{status.email}</strong>
          </p>
          <div className="rounded-xl bg-teal-50 p-4 text-sm leading-6 text-teal-900">
            <p className="font-semibold">Inscription confirmée : 5 % de réduction sur le premier mois</p>
            <p className="mt-2">{NEWSLETTER_OFFER_TEXT}</p>
            {status.offerEligible === false && (
              <p className="mt-2">Votre entreprise n’est pas éligible à cette offre de premier abonnement. Vous pouvez recevoir la newsletter sans nouvelle remise.</p>
            )}
          </div>
          {status.discountReady && (
            <p role="status" className="text-sm text-teal-700">
              Votre remise est disponible et sera appliquée automatiquement au
              paiement du premier abonnement de votre entreprise.
            </p>
          )}
          {status.status === "subscribed" ? (
            <>
              <p className="text-sm text-teal-700">
                Vous êtes inscrit à la newsletter.
              </p>
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={() => action("unsubscribe")}
              >
                Me désabonner
              </button>
            </>
          ) : (
            <>
              {status.status === "pending" && (
                <p className="text-sm text-slate-600">
                  Consultez votre boîte email et confirmez votre inscription.
                  Vérifiez aussi les indésirables.
                </p>
              )}
              <label className="flex items-start gap-3 text-sm leading-6 text-slate-600">
                <input
                  type="checkbox"
                  className="mt-1 shrink-0"
                  checked={consent}
                  disabled={busy}
                  onChange={(event) => setConsent(event.target.checked)}
                />
                <span>{NEWSLETTER_CONSENT_TEXT}</span>
              </label>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={busy || !consent || !status.emailEnabled}
                  onClick={() => action("subscribe", { consent: true })}
                >
                  {busy
                    ? "Enregistrement…"
                    : status.status === "pending"
                      ? "Renvoyer le lien de confirmation"
                      : "M’inscrire à la newsletter"}
                </button>
                {status.status === "pending" && (
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={busy}
                    onClick={refresh}
                  >
                    Vérifier ma confirmation
                  </button>
                )}
                {status.status === "pending" && !prompt && (
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={busy}
                    onClick={() => action("unsubscribe")}
                  >
                    Annuler la demande
                  </button>
                )}
                {prompt && (
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={busy}
                    onClick={() => action("dismiss")}
                  >
                    Non merci
                  </button>
                )}
              </div>
              {!status.emailEnabled && (
                <p className="text-sm text-slate-500">
                  L’inscription par email est temporairement indisponible.
                </p>
              )}
            </>
          )}
        </div>
      )}
      {message && (
        <p role="status" className="mt-4 text-sm text-teal-700">
          {message}
        </p>
      )}
      {error && (
        <div className="mt-4">
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
          {!status && (
            <button
              type="button"
              className="btn-secondary mt-3"
              disabled={busy}
              onClick={refresh}
            >
              Réessayer
            </button>
          )}
        </div>
      )}
    </section>
  );
}
