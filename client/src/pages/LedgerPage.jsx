import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import toast from "react-hot-toast";
import api from "../lib/api.js";
import { formatCurrency, formatDate } from "../lib/format.js";

const initialFilters = {
  from: "",
  to: "",
  type: ""
};

export default function LedgerPage() {
  const [overview, setOverview] = useState({
    revenue: 0,
    purchasesPaid: 0,
    expenses: 0,
    pendingPayables: 0,
    netCashflow: 0
  });
  const [entries, setEntries] = useState([]);
  const [filters, setFilters] = useState(initialFilters);
  const [forecast, setForecast] = useState({
    expectedInflow: 0,
    overdueInflow: 0,
    expectedOutflow: 0,
    projectedNet: 0,
    series: []
  });
  const [exportMonth, setExportMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  async function loadOverview() {
    const { data } = await api.get("/ledger/overview");
    setOverview(data);
  }

  async function loadEntries(activeFilters = filters) {
    const params = {};
    if (activeFilters.from) {
      params.from = activeFilters.from;
    }
    if (activeFilters.to) {
      params.to = activeFilters.to;
    }
    if (activeFilters.type) {
      params.type = activeFilters.type;
    }

    const { data } = await api.get("/ledger/entries", { params });
    setEntries(data);
  }

  async function loadForecast() {
    const { data } = await api.get("/ledger/cashflow-forecast");
    setForecast(data);
  }

  useEffect(() => {
    let active = true;
    Promise.all([loadOverview(), loadEntries(), loadForecast()])
      .catch(() => toast.error("Impossible de charger le grand livre."))
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  async function applyFilters(event) {
    event.preventDefault();
    try {
      await loadEntries(filters);
    } catch (error) {
      toast.error("Filtrage impossible.");
    }
  }

  async function resetFilters() {
    const nextFilters = initialFilters;
    setFilters(nextFilters);
    try {
      await loadEntries(nextFilters);
    } catch (error) {
      toast.error("Reinitialisation impossible.");
    }
  }

  async function exportCsv() {
    const params = {};
    if (filters.from) {
      params.from = filters.from;
    }
    if (filters.to) {
      params.to = filters.to;
    }
    if (filters.type) {
      params.type = filters.type;
    }

    setExporting(true);
    try {
      const response = await api.get("/ledger/export.csv", {
        params,
        responseType: "blob"
      });

      const blob = new Blob([response.data], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const contentDisposition = response.headers["content-disposition"] || "";
      const filenameMatch = contentDisposition.match(/filename=\"?([^"]+)\"?/i);
      const fallbackDate = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.download = filenameMatch?.[1] || `grand-livre-${fallbackDate}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Export CSV genere.");
    } catch (error) {
      toast.error("Impossible d'exporter le CSV.");
    } finally {
      setExporting(false);
    }
  }

  async function exportMonthly(format) {
    setExporting(true);
    try {
      const response = await api.get(`/ledger/monthly-export.${format}`, {
        params: { month: exportMonth },
        responseType: "blob"
      });
      const mime = format === "pdf" ? "application/pdf" : "text/csv;charset=utf-8";
      const blob = new Blob([response.data], { type: mime });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `export-comptable-${exportMonth}.${format}`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`Export ${format.toUpperCase()} généré.`);
    } catch (error) {
      toast.error("Export mensuel impossible.");
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return (
      <section className="card">
        <p className="text-sm text-slate-500">Chargement du grand livre...</p>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <article className="card">
          <p className="text-sm text-slate-500">Revenus encaisses</p>
          <p className="mt-2 font-heading text-2xl font-semibold text-emerald-700">
            {formatCurrency(overview.revenue)}
          </p>
        </article>
        <article className="card">
          <p className="text-sm text-slate-500">Achats payes</p>
          <p className="mt-2 font-heading text-2xl font-semibold text-rose-700">
            {formatCurrency(overview.purchasesPaid)}
          </p>
        </article>
        <article className="card">
          <p className="text-sm text-slate-500">Dépenses comptabilisées</p>
          <p className="mt-2 font-heading text-2xl font-semibold text-rose-700">
            {formatCurrency(overview.expenses)}
          </p>
        </article>
        <article className="card">
          <p className="text-sm text-slate-500">Dettes fournisseurs</p>
          <p className="mt-2 font-heading text-2xl font-semibold text-amber-700">
            {formatCurrency(overview.pendingPayables)}
          </p>
        </article>
        <article className="card">
          <p className="text-sm text-slate-500">Cashflow net</p>
          <p
            className={[
              "mt-2 font-heading text-2xl font-semibold",
              overview.netCashflow >= 0 ? "text-brand-600" : "text-rose-700"
            ].join(" ")}
          >
            {formatCurrency(overview.netCashflow)}
          </p>
        </article>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="card">
          <p className="text-sm text-slate-500">Encaissements prévus</p>
          <p className="mt-2 font-heading text-2xl font-semibold text-emerald-700">
            {formatCurrency(forecast.expectedInflow)}
          </p>
        </article>
        <article className="card">
          <p className="text-sm text-slate-500">Factures en retard</p>
          <p className="mt-2 font-heading text-2xl font-semibold text-amber-700">
            {formatCurrency(forecast.overdueInflow)}
          </p>
        </article>
        <article className="card">
          <p className="text-sm text-slate-500">Décaissements prévus</p>
          <p className="mt-2 font-heading text-2xl font-semibold text-rose-700">
            {formatCurrency(forecast.expectedOutflow)}
          </p>
        </article>
        <article className="card">
          <p className="text-sm text-slate-500">Projection nette 60 jours</p>
          <p
            className={[
              "mt-2 font-heading text-2xl font-semibold",
              forecast.projectedNet >= 0 ? "text-brand-600" : "text-rose-700"
            ].join(" ")}
          >
            {formatCurrency(forecast.projectedNet)}
          </p>
        </article>
      </section>

      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-heading text-lg font-semibold text-slate-900">Filtres du grand livre</h2>
          <button
            type="button"
            className="btn-secondary gap-2"
            onClick={exportCsv}
            disabled={exporting}
          >
            <Download size={15} />
            {exporting ? "Export..." : "Exporter CSV"}
          </button>
        </div>
        <form onSubmit={applyFilters} className="mt-4 grid gap-3 sm:grid-cols-4">
          <div>
            <label className="field-label">Du</label>
            <input
              type="date"
              className="field-input"
              value={filters.from}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  from: event.target.value
                }))
              }
            />
          </div>
          <div>
            <label className="field-label">Au</label>
            <input
              type="date"
              className="field-input"
              value={filters.to}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  to: event.target.value
                }))
              }
            />
          </div>
          <div>
            <label className="field-label">Type</label>
            <select
              className="field-input"
              value={filters.type}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  type: event.target.value
                }))
              }
            >
              <option value="">Tous</option>
              <option value="invoice">Revenus factures</option>
              <option value="purchase">Achats fournisseurs</option>
              <option value="expense">Dépenses</option>
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" className="btn-primary">
              Filtrer
            </button>
            <button type="button" className="btn-secondary" onClick={resetFilters}>
              Reinit
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg font-semibold text-slate-900">Export comptable mensuel</h2>
            <p className="mt-1 text-sm text-slate-500">
              Génère un package comptable filtré par mois en CSV ou PDF.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="field-label">Mois</label>
              <input
                type="month"
                className="field-input"
                value={exportMonth}
                onChange={(event) => setExportMonth(event.target.value)}
              />
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => exportMonthly("csv")}
              disabled={exporting}
            >
              CSV mensuel
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => exportMonthly("pdf")}
              disabled={exporting}
            >
              PDF mensuel
            </button>
          </div>
        </div>
      </section>

      <section className="card overflow-hidden">
        <h2 className="mb-4 font-heading text-lg font-semibold text-slate-900">Ecritures</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-3">Date</th>
                <th className="pb-3">Type</th>
                <th className="pb-3">Reference</th>
                <th className="pb-3">Contrepartie</th>
                <th className="pb-3">Catégorie</th>
                <th className="pb-3 text-right">Montant</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, index) => (
                <tr
                  key={`${entry.entryType}-${entry.sourceId}-${index}`}
                  className="border-b border-slate-100 last:border-0"
                >
                  <td className="py-3 text-slate-700">{formatDate(entry.entryDate)}</td>
                  <td className="py-3">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                      {entry.entryType}
                    </span>
                  </td>
                  <td className="py-3 font-semibold text-slate-900">{entry.referenceNumber}</td>
                  <td className="py-3 text-slate-700">{entry.counterpartName}</td>
                  <td className="py-3 text-slate-700">{entry.category}</td>
                  <td
                    className={[
                      "py-3 text-right font-semibold",
                      entry.direction === "credit" ? "text-emerald-700" : "text-rose-700"
                    ].join(" ")}
                  >
                    {entry.direction === "credit" ? "+" : "-"} {formatCurrency(entry.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {entries.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            Aucune ecriture sur cette periode.
          </div>
        )}
      </section>
    </div>
  );
}
