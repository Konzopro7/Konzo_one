import { useEffect, useMemo, useState } from "react";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  Legend
} from "chart.js";
import { Bar, Line } from "react-chartjs-2";
import { ArrowUpRight, Send } from "lucide-react";
import toast from "react-hot-toast";
import api from "../lib/api.js";
import { formatCompactDate, formatCurrency, formatDate } from "../lib/format.js";
import StatCard from "../components/StatCard.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { useAuth } from "../hooks/useAuth.jsx";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend,
  Filler
);

export default function DashboardPage() {
  const { isAdmin } = useAuth();
  const [summary, setSummary] = useState({
    totalQuotes: 0,
    totalInvoices: 0,
    revenueGenerated: 0,
    activeClients: 0,
    activeTeamMembers: 0
  });
  const [charts, setCharts] = useState({
    labels: [],
    revenueSeries: [],
    quoteSeries: []
  });
  const [recentQuotes, setRecentQuotes] = useState([]);
  const [reminders, setReminders] = useState({
    reminderEnabled: false,
    invoiceDueSoonCount: 0,
    invoiceOverdueCount: 0,
    quoteFollowupCount: 0,
    recentLogs: []
  });
  const [loading, setLoading] = useState(true);
  const [runningReminders, setRunningReminders] = useState(false);

  async function loadData() {
    const requests = [
      api.get("/dashboard/summary"),
      api.get("/dashboard/charts"),
      api.get("/dashboard/recent-quotes"),
      api.get("/reminders/summary")
    ];
    const [summaryRes, chartRes, recentRes, reminderRes] = await Promise.all(requests);
    setSummary(summaryRes.data);
    setCharts(chartRes.data);
    setRecentQuotes(recentRes.data);
    setReminders(reminderRes.data);
  }

  useEffect(() => {
    let active = true;
    loadData()
      .catch(() => toast.error("Impossible de charger le dashboard."))
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const revenueChartData = useMemo(
    () => ({
      labels: charts.labels.map((label) => formatCompactDate(label)),
      datasets: [
        {
          label: "Revenus",
          data: charts.revenueSeries,
          borderColor: "#0B3C5D",
          backgroundColor: "rgba(11, 60, 93, 0.12)",
          fill: true,
          tension: 0.35,
          borderWidth: 2.5,
          pointRadius: 0,
          pointHoverRadius: 4
        }
      ]
    }),
    [charts]
  );

  const quoteChartData = useMemo(
    () => ({
      labels: charts.labels.map((label) => formatCompactDate(label)),
      datasets: [
        {
          label: "Devis",
          data: charts.quoteSeries,
          borderRadius: 10,
          backgroundColor: "rgba(46, 196, 182, 0.85)"
        }
      ]
    }),
    [charts]
  );

  const lineOptions = {
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false }
    },
    scales: {
      y: {
        grid: { color: "rgba(100, 116, 139, 0.12)" },
        border: { display: false },
        ticks: {
          callback: (value) => `${value} CAD`
        }
      },
      x: {
        grid: { display: false },
        border: { display: false }
      }
    }
  };

  const barOptions = {
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: "rgba(100, 116, 139, 0.12)" },
        border: { display: false }
      },
      x: {
        grid: { display: false },
        border: { display: false }
      }
    }
  };

  async function runRemindersNow() {
    setRunningReminders(true);
    try {
      const { data } = await api.post("/reminders/run");
      toast.success(
        `Relances lancées: ${data.invoicesReminded} factures, ${data.quotesReminded} devis`
      );
      await loadData();
    } catch (error) {
      toast.error(error.response?.data?.message || "Exécution impossible.");
    } finally {
      setRunningReminders(false);
    }
  }

  if (loading) {
    return (
      <section className="card">
        <p className="text-sm text-slate-500">Chargement des statistiques...</p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard title="Total devis créés" value={summary.totalQuotes} />
        <StatCard title="Total factures" value={summary.totalInvoices} />
        <StatCard
          title="Revenus générés"
          value={summary.revenueGenerated}
          type="currency"
          accent
        />
        <StatCard title="Clients actifs" value={summary.activeClients} />
        <StatCard title="Équipe active" value={summary.activeTeamMembers} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
        <article className="card h-[340px]">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-heading text-lg font-semibold text-slate-900">
              Évolution des revenus
            </h3>
            <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-500">
              30 derniers jours
            </span>
          </div>
          <Line data={revenueChartData} options={lineOptions} />
        </article>

        <article className="card h-[340px]">
          <div className="mb-3">
            <h3 className="font-heading text-lg font-semibold text-slate-900">Évolution des devis</h3>
          </div>
          <Bar data={quoteChartData} options={barOptions} />
        </article>
      </section>

      <section className="card">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-heading text-lg font-semibold text-slate-900">
              Relances automatiques
            </h3>
            <p className="text-sm text-slate-500">
              Pilotage des rappels clients sur devis et factures.
            </p>
          </div>
          {isAdmin ? (
            <button
              type="button"
              className="btn-primary gap-2"
              onClick={runRemindersNow}
              disabled={runningReminders}
            >
              <Send size={15} />
              {runningReminders ? "Exécution..." : "Lancer maintenant"}
            </button>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Factures à échéance proche</p>
            <p className="mt-1 font-heading text-2xl font-semibold text-slate-900">
              {reminders.invoiceDueSoonCount}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Factures en retard</p>
            <p className="mt-1 font-heading text-2xl font-semibold text-rose-600">
              {reminders.invoiceOverdueCount}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Devis à relancer</p>
            <p className="mt-1 font-heading text-2xl font-semibold text-slate-900">
              {reminders.quoteFollowupCount}
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {reminders.recentLogs?.slice(0, 5).map((log) => (
            <div
              key={log.id}
              className="flex flex-wrap items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                  {log.reminderType}
                </span>
                <span className="text-slate-700">
                  {log.entityType} #{log.entityId}
                </span>
              </div>
              <span className="text-xs text-slate-500">{formatDate(log.sentAt)}</span>
            </div>
          ))}
          {(!reminders.recentLogs || reminders.recentLogs.length === 0) && (
            <p className="text-sm text-slate-500">Aucune relance récente.</p>
          )}
        </div>
      </section>

      <section className="card">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-heading text-lg font-semibold text-slate-900">Devis récents</h3>
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Mise a jour en direct
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-3">Référence</th>
                <th className="pb-3">Client</th>
                <th className="pb-3">Date</th>
                <th className="pb-3">Statut</th>
                <th className="pb-3 text-right">Montant</th>
              </tr>
            </thead>
            <tbody>
              {recentQuotes.map((quote) => (
                <tr key={quote.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-3 font-semibold text-slate-900">{quote.quoteNumber}</td>
                  <td className="py-3">
                    <p className="font-medium text-slate-800">{quote.clientName}</p>
                    <p className="text-xs text-slate-500">{quote.clientCompany || "Sans entreprise"}</p>
                  </td>
                  <td className="py-3 text-slate-600">{formatDate(quote.issueDate)}</td>
                  <td className="py-3">
                    <StatusBadge status={quote.status} />
                  </td>
                  <td className="py-3 text-right font-semibold text-slate-900">
                    {formatCurrency(quote.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {recentQuotes.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            Aucun devis récent pour le moment.
          </div>
        )}
      </section>

      <section className="rounded-2xl bg-gradient-to-r from-brand-500 to-aqua-500 p-5 text-white shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-heading text-xl font-semibold">Vision claire de ta performance</h3>
            <p className="mt-1 text-sm text-blue-50">
              Suis tes devis, paiements Stripe et relances automatiques en temps réel.
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2 text-sm font-semibold">
            Objectif: accélérer la conversion
            <ArrowUpRight size={16} />
          </span>
        </div>
      </section>
    </div>
  );
}
