import { useEffect, useState } from "react";
import api from "../lib/api.js";
import { formatDate } from "../lib/format.js";
export default function NewsletterAdminPanel() {
  const [status, setStatus] = useState("subscribed"),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [data, setData] = useState(null),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError("");
    const timer = setTimeout(
      () =>
        api
          .get("/platform/newsletter", { params: { status, search, page } })
          .then(({ data }) => {
            if (active) setData(data);
          })
          .catch(() => {
            if (active) setError("Impossible de charger les inscriptions.");
          })
          .finally(() => {
            if (active) setBusy(false);
          }),
      250,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [status, search, page, revision]);
  return (
    <section className="card space-y-4">
      <h2 className="text-xl font-semibold">Inscriptions à la newsletter</h2>
      <p className="text-sm text-slate-500">
        Seules les inscriptions confirmées et encore actives autorisent l’envoi
        de la newsletter.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="newsletter-search" className="field-label">
            Rechercher
          </label>
          <input
            id="newsletter-search"
            className="field-input"
            value={search}
            maxLength={120}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Nom, email ou entreprise"
          />
        </div>
        <div>
          <label htmlFor="newsletter-status" className="field-label">
            Statut
          </label>
          <select
            id="newsletter-status"
            className="field-input"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="subscribed">Inscrits confirmés</option>
            <option value="pending">Confirmation attendue</option>
            <option value="unsubscribed">Non inscrits / désabonnés</option>
          </select>
        </div>
      </div>
      {busy ? (
        <p role="status" className="text-sm text-slate-500">
          Chargement…
        </p>
      ) : error ? (
        <div>
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
          <button
            className="btn-secondary mt-3"
            onClick={() => setRevision((value) => value + 1)}
          >
            Réessayer
          </button>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="p-3">Utilisateur</th>
                  <th className="p-3">Entreprise</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">Confirmation</th>
                  <th className="p-3">Retrait</th>
                </tr>
              </thead>
              <tbody>
                {data?.items?.map((item) => (
                  <tr key={item.user_id} className="border-b border-slate-100">
                    <td className="p-3">{item.full_name}</td>
                    <td className="p-3">{item.agency}</td>
                    <td className="p-3 break-all">{item.email}</td>
                    <td className="p-3">{formatDate(item.confirmed_at)}</td>
                    <td className="p-3">{formatDate(item.unsubscribed_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data?.items?.length && (
            <p className="text-sm text-slate-500">
              Aucune inscription pour ces critères.
            </p>
          )}
          <div className="flex items-center gap-3">
            <button
              className="btn-secondary"
              disabled={page === 1}
              onClick={() => setPage((value) => value - 1)}
            >
              Précédent
            </button>
            <span className="text-sm text-slate-500">Page {page}</span>
            <button
              className="btn-secondary"
              disabled={!data?.hasMore}
              onClick={() => setPage((value) => value + 1)}
            >
              Suivant
            </button>
          </div>
        </>
      )}
    </section>
  );
}
