import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import api from "../lib/api.js";
import { formatDate } from "../lib/format.js";

export default function ActivityPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api
      .get("/audit")
      .then(({ data }) => {
        if (active) setLogs(data);
      })
      .catch(() => toast.error("Impossible de charger le journal d'activité."))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-5">
      <section className="card">
        <h2 className="font-heading text-xl font-semibold text-slate-900">Journal d'activité</h2>
        <p className="mt-1 text-sm text-slate-500">
          Suivi des créations, modifications et suppressions réalisées dans l'agence.
        </p>
      </section>

      <section className="card overflow-hidden">
        {loading ? (
          <p className="text-sm text-slate-500">Chargement...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-3">Date</th>
                  <th className="pb-3">Utilisateur</th>
                  <th className="pb-3">Action</th>
                  <th className="pb-3">Entité</th>
                  <th className="pb-3">Statut</th>
                  <th className="pb-3">Chemin</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-3 text-slate-600">{formatDate(log.createdAt)}</td>
                    <td className="py-3">
                      <p className="font-semibold text-slate-900">{log.userName || "System"}</p>
                      <p className="text-xs text-slate-500">{log.userEmail || "-"}</p>
                    </td>
                    <td className="py-3">
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 text-slate-700">
                      {log.entityType}
                      {log.entityId ? ` #${log.entityId}` : ""}
                    </td>
                    <td className="py-3 text-slate-700">{log.statusCode}</td>
                    <td className="py-3 text-xs text-slate-500">{log.path}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && logs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            Aucune activité enregistrée.
          </div>
        ) : null}
      </section>
    </div>
  );
}
