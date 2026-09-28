import { useEffect, useState } from "react";
import api from "../lib/api.js";

const labels = { AUTH_OK: "Connexion réussie", AUTH_FAIL: "Connexion refusée", MFA_FAIL: "Code refusé", MFA_ENROLLED: "Double authentification activée", RECOVERY_USED: "Code de secours utilisé", RESET_REQUESTED: "Réinitialisation demandée", RESET_EMAIL_SENT: "Email de récupération envoyé", RESET_EMAIL_FAIL: "Email de récupération refusé", PASSWORD_RESET: "Mot de passe réinitialisé" };
export default function SecurityLog({ endpoint, platform = false }) {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [data, setData] = useState({ items: [], hasMore: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    api.get(endpoint, { params: { page, result, search: query } }).then(({ data }) => { if (active) setData(data); })
      .catch(() => { if (active) setError("Impossible de charger les connexions. Réessayez."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [endpoint, page, result, query, refresh]);
  return <section className="card space-y-4">
    <div><h3 className="font-heading text-lg font-semibold text-slate-900">Connexions et sécurité</h3><p className="mt-1 text-sm text-slate-500">Connexions, codes refusés et activation de la double authentification{platform ? " pour toute la plateforme" : " dans votre entreprise"}.</p></div>
    <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); setPage(1); setQuery(search); }}>
      <input className="field-input flex-1 min-w-0" aria-label="Rechercher un utilisateur" placeholder="Nom ou email" maxLength={120} value={search} onChange={e => setSearch(e.target.value)} />
      <select className="field-input sm:w-auto" aria-label="Résultat de connexion" value={result} onChange={e => { setPage(1); setResult(e.target.value); }}><option value="">Tous les résultats</option><option value="success">Réussis</option><option value="failure">Refusés</option></select>
      <button className="btn-secondary" disabled={loading}>Rechercher</button><button type="button" className="btn-secondary" disabled={loading} onClick={() => setRefresh(n => n+1)}>Actualiser</button>
    </form>
    {loading ? <p role="status" className="text-sm text-slate-500">Chargement…</p> : error ? <p role="alert" className="text-sm text-red-600">{error}</p> : data.items.length === 0 ? <p className="text-sm text-slate-500">Aucun événement de sécurité trouvé.</p> : <div className="overflow-x-auto"><table className="min-w-full text-left text-sm">
      <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">{["Date et heure", "Utilisateur", ...(platform ? ["Entreprise"] : []), "Événement", "Adresse IP"].map(label => <th key={label} className="pb-3 pr-4">{label}</th>)}</tr></thead>
      <tbody>{data.items.map(item => <tr key={item.id} className="border-b border-slate-100 last:border-0">
        <td className="py-3 pr-4 whitespace-nowrap text-slate-600">{new Date(item.createdAt).toLocaleString("fr-CA")}</td><td className="py-3 pr-4"><p className="font-semibold">{item.userName || "Compte non identifié"}</p><p className="text-xs text-slate-500">{item.userEmail || "—"}</p></td>
        {platform && <td className="py-3 pr-4">{item.agencyName || "—"}</td>}<td className="py-3 pr-4"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${item.success ? "bg-teal-50 text-teal-700" : "bg-red-50 text-red-700"}`}>{labels[item.action] || item.action}</span></td><td className="py-3 text-xs text-slate-500">{item.ip || "—"}</td>
      </tr>)}</tbody></table></div>}
    <div className="flex items-center justify-between gap-2"><button className="btn-secondary" disabled={loading || page===1} onClick={() => setPage(p => p-1)}>Précédent</button><span className="text-sm text-slate-500">Page {page}</span><button className="btn-secondary" disabled={loading || !!error || !data.hasMore} onClick={() => setPage(p => p+1)}>Suivant</button></div>
  </section>;
}
