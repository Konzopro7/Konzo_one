import { useEffect, useRef, useState } from "react";
import api from "../lib/api.js";
export default function PlatformContactPanel() {
  const [phone, setPhone] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const lock = useRef(false);
  useEffect(() => {
    let active = true;
    api
      .get("/support/contact")
      .then(({ data }) => {
        if (active) setPhone(data.phone || "");
      })
      .catch(() => {
        if (active) setError("Coordonnées indisponibles. Rechargez la page.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function save(event) {
    event.preventDefault();
    if (lock.current || loading) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { data } = await api.put("/platform/contact", { phone });
      setPhone(data.phone);
      setMessage(
        "Le numéro de contact est enregistré et visible dans les paramètres des clients.",
      );
    } catch (error) {
      setError(error.response?.data?.message || "Enregistrement impossible.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="card">
      <h2 className="font-semibold">Téléphone de contact konzoCRM.com</h2>
      <p className="mt-2 text-sm text-slate-500">
        Ce numéro sera affiché dans « Besoin d’aide ? » pour tous les espaces
        clients.
      </p>
      <form onSubmit={save} className="mt-4 flex flex-wrap items-end gap-3">
        <div className="w-full sm:max-w-sm">
          <label htmlFor="platform-support-phone" className="field-label">
            Téléphone professionnel avec indicatif
          </label>
          <input
            id="platform-support-phone"
            type="tel"
            className="field-input"
            value={phone}
            maxLength={40}
            disabled={loading || busy}
            onChange={(event) => setPhone(event.target.value)}
          />
        </div>
        <button className="btn-primary" disabled={loading || busy}>
          {busy ? "Enregistrement…" : "Enregistrer le numéro"}
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="mt-3 text-sm text-teal-700">
          {message}
        </p>
      )}
    </section>
  );
}
