import { useEffect, useMemo, useState } from "react";
import SecurityLog from "../components/SecurityLog.jsx";
import AdminWorkspaces from "../components/AdminWorkspaces.jsx";
import AdminAudit from "../components/AdminAudit.jsx";
import GoogleAnalyticsPanel from "../components/GoogleAnalyticsPanel.jsx";
import NewsletterAdminPanel from "../components/NewsletterAdminPanel.jsx";
import PlatformContactPanel from "../components/PlatformContactPanel.jsx";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  Legend
} from "chart.js";
import { Bar, Line } from "react-chartjs-2";
import toast from "react-hot-toast";
import api from "../lib/api.js";
import { formatCurrency, formatCompactDate, formatDate } from "../lib/format.js";
import { useAuth } from "../hooks/useAuth.jsx";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend
);

const defaultPayload = {
  metrics: {
    totalAgencies: 0,
    activeTrials: 0,
    activeSubscriptions: 0,
    pastDue: 0,
    canceled: 0,
    totalUsers: 0,
    activeUsers: 0,
    proCount: 0,
    premiumCount: 0,
    monthlyRevenueEstimate: 0
  },
  signupSeries: [],
  trafficSeries: [],
  topPaths: [],
  recentActivity: []
};

export default function PlatformAdminPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState(defaultPayload);
  const [error,setError]=useState("");
  const [refresh,setRefresh]=useState(0);
  const [tab,setTab]=useState("overview");
  const [updatedAt,setUpdatedAt]=useState(null);

  useEffect(() => {
    let active = true;
    if(!user?.isPlatformAdmin){setLoading(false);return;}
    setLoading(true);setError("");
    api
      .get("/platform/overview")
      .then(({ data }) => {
        if (active) {
          setPayload(data);
          setUpdatedAt(new Date());
        }
      })
      .catch((error) => {
        if(active)setError(error.response?.data?.message || "Console inaccessible. Réessayez.");
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [user?.isPlatformAdmin,refresh]);

  const trafficData = useMemo(
    () => ({
      labels: payload.trafficSeries.map((entry) => formatCompactDate(entry.day)),
      datasets: [
        {
          label: "Requetes API",
          data: payload.trafficSeries.map((entry) => Number(entry.value || 0)),
          borderColor: "#0B3C5D",
          backgroundColor: "rgba(11, 60, 93, 0.15)",
          tension: 0.35,
          fill: true
        }
      ]
    }),
    [payload.trafficSeries]
  );

  const signupsData = useMemo(
    () => ({
      labels: payload.signupSeries.map((entry) => formatCompactDate(entry.day)),
      datasets: [
        {
          label: "Nouvelles agences",
          data: payload.signupSeries.map((entry) => Number(entry.value || 0)),
          backgroundColor: "rgba(46, 196, 182, 0.85)",
          borderRadius: 10
        }
      ]
    }),
    [payload.signupSeries]
  );

  if (!user?.isPlatformAdmin) {
    return (
      <section className="card">
        <h2 className="font-heading text-xl font-semibold text-slate-900">Admin plateforme</h2>
        <p className="mt-2 text-sm text-slate-600">
          Cette section est réservée au super administrateur du SaaS.
        </p>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="card">
        <p className="text-sm text-slate-500">Chargement des analytics plateforme...</p>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="card">
        <h2 className="font-heading text-xl font-semibold text-slate-900">
          Centre de contrôle du SaaS
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Vue globale de la croissance, des abonnements et du trafic de ton SaaS.
        </p>
        <p className="mt-2 text-sm text-slate-500">Double authentification configurée : {payload.metrics.protectedUsers ?? 0} / {payload.metrics.activeUsers} utilisateurs actifs.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3"><button className="btn-secondary" onClick={()=>setRefresh(n=>n+1)} disabled={loading}>Actualiser les indicateurs</button>{updatedAt&&<span className="text-xs text-slate-500">Mis à jour à {updatedAt.toLocaleTimeString("fr-CA")}</span>}</div>
      </section>
      <nav aria-label="Sections d’administration" className="flex flex-wrap gap-2">{[["overview","Vue d’ensemble"],["agencies","Entreprises et utilisateurs"],["newsletter","Newsletter"],["ga4","Google Analytics 4"],["security","Connexions et sécurité"],["audit","Interventions admin"]].map(([key,label])=><button key={key} aria-current={tab===key?"page":undefined} className={tab===key?"btn-primary":"btn-secondary"} onClick={()=>setTab(key)}>{label}</button>)}</nav>
      {tab==='newsletter'&&<NewsletterAdminPanel/>}
      {tab==='overview'&&<PlatformContactPanel/>}
      {error&&<section className="card"><p role="alert" className="text-sm text-red-600">{error}</p></section>}
      {tab==="agencies"&&<AdminWorkspaces/>}{tab==="ga4"&&<GoogleAnalyticsPanel/>}{tab==="security"&&<SecurityLog endpoint="/platform/security" platform/>}{tab==="audit"&&<AdminAudit/>}
      {tab==="overview"&&!error&&<>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <article className="card">
          <p className="text-sm text-slate-500">Agences totales</p>
          <p className="mt-2 font-heading text-2xl font-semibold text-slate-900">
            {payload.metrics.totalAgencies}
          </p>
        </article>
        <article className="card">
          <p className="text-sm text-slate-500">Essais actifs</p>
          <p className="mt-2 font-heading text-2xl font-semibold text-brand-600">
            {payload.metrics.activeTrials}
          </p>
        </article>
        <article className="card">
          <p className="text-sm text-slate-500">Abonnements actifs</p>
          <p className="mt-2 font-heading text-2xl font-semibold text-emerald-700">
            {payload.metrics.activeSubscriptions}
          </p>
        </article>
        <article className="card">
          <p className="text-sm text-slate-500">Comptes en retard</p>
          <p className="mt-2 font-heading text-2xl font-semibold text-amber-700">
            {payload.metrics.pastDue}
          </p>
        </article>
        <article className="card">
          <p className="text-sm text-slate-500">Valeur mensuelle des plans actifs</p>
          <p className="mt-2 font-heading text-2xl font-semibold text-slate-900">
            {formatCurrency(payload.metrics.monthlyRevenueEstimate)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Estimation tarifaire · ne représente pas les paiements encaissés</p>
        </article>
        <article className="card"><p className="text-sm text-slate-500">Utilisateurs actifs</p><p className="mt-2 font-heading text-2xl font-semibold text-slate-900">{payload.metrics.activeUsers} / {payload.metrics.totalUsers}</p><p className="mt-1 text-xs text-slate-500">{payload.metrics.suspendedAgencies||0} entreprise(s) suspendue(s)</p></article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <article className="card h-[320px]">
          <h3 className="mb-3 font-heading text-lg font-semibold text-slate-900">Trafic API (30 jours)</h3>
          <div className="h-60"><Line
            data={trafficData}
            options={{
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                y: { beginAtZero: true, border: { display: false } },
                x: { border: { display: false }, grid: { display: false } }
              }
            }}
          /></div>
        </article>

        <article className="card h-[320px]">
          <h3 className="mb-3 font-heading text-lg font-semibold text-slate-900">
            Nouvelles agences (30 jours)
          </h3>
          <div className="h-60"><Bar
            data={signupsData}
            options={{
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                y: { beginAtZero: true, border: { display: false } },
                x: { border: { display: false }, grid: { display: false } }
              }
            }}
          /></div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="card overflow-hidden">
          <h3 className="mb-4 font-heading text-lg font-semibold text-slate-900">Endpoints les plus appeles</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-3">Endpoint</th>
                  <th className="pb-3 text-right">Hits (7j)</th>
                </tr>
              </thead>
              <tbody>
                {payload.topPaths.map((entry) => (
                  <tr key={entry.path} className="border-b border-slate-100 last:border-0">
                    <td className="py-3 font-mono text-xs text-slate-700">{entry.path}</td>
                    <td className="py-3 text-right font-semibold text-slate-900">{entry.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="card overflow-hidden">
          <h3 className="mb-4 font-heading text-lg font-semibold text-slate-900">Activite recente</h3>
          <div className="max-h-[340px] space-y-2 overflow-y-auto pr-1">
            {payload.recentActivity.map((entry) => (
              <div
                key={entry.id}
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-700"
              >
                <p className="font-semibold text-slate-900">
                  {entry.method} {entry.path}
                </p>
                <p className="mt-0.5">
                  {entry.agencyName} • {entry.userName || entry.userEmail || "Anonyme"}
                </p>
                <p className="mt-0.5 text-slate-500">
                  {formatDate(entry.createdAt)} • {entry.statusCode} • {entry.durationMs} ms
                </p>
              </div>
            ))}
          </div>
        </article>
      </section>
      </>}
    </div>
  );
}
