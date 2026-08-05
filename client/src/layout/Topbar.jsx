import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, Menu, Search } from "lucide-react";
import toast from "react-hot-toast";
import api from "../lib/api.js";
import { useAuth } from "../hooks/useAuth.jsx";

const reminderTypeLabels = {
  invoice_due_soon: "Facture bientôt à échéance",
  invoice_overdue: "Facture en retard",
  quote_followup: "Relance devis"
};

function formatReminderType(reminderType) {
  return reminderTypeLabels[reminderType] || "Notification";
}

function formatDate(value) {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export default function Topbar({ onOpenSidebar }) {
  const { user } = useAuth();
  const [panelOpen, setPanelOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const panelRef = useRef(null);

  const pendingCount = useMemo(
    () =>
      Number(summary?.invoiceDueSoonCount || 0) +
      Number(summary?.invoiceOverdueCount || 0) +
      Number(summary?.quoteFollowupCount || 0),
    [summary]
  );

  useEffect(() => {
    if (!panelOpen) {
      return undefined;
    }

    function handleClickOutside(event) {
      if (!panelRef.current?.contains(event.target)) {
        setPanelOpen(false);
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        setPanelOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [panelOpen]);

  async function openNotifications() {
    setPanelOpen(true);
    setLoading(true);
    try {
      const { data } = await api.get("/reminders/summary");
      setSummary(data);
    } catch (error) {
      toast.error(error.response?.data?.message || "Impossible de charger les notifications.");
    } finally {
      setLoading(false);
    }
  }

  async function handleBellClick() {
    if (panelOpen) {
      setPanelOpen(false);
      return;
    }
    await openNotifications();
  }

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/80 backdrop-blur">
      <div className="flex items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={onOpenSidebar}
          className="rounded-xl border border-slate-200 bg-white p-2 text-slate-700 shadow-sm lg:hidden"
        >
          <Menu size={18} />
        </button>

        <div className="relative hidden max-w-xl flex-1 sm:block">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher un client, devis, facture..."
            className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>

        <div className="ml-auto flex items-center gap-3">
          <div className="relative" ref={panelRef}>
            <button
              type="button"
              onClick={handleBellClick}
              className="relative rounded-xl border border-slate-200 bg-white p-2 text-slate-700 shadow-sm transition hover:border-brand-200 hover:text-brand-500"
              aria-label="Afficher les notifications"
              aria-expanded={panelOpen}
            >
              <Bell size={18} />
              {pendingCount > 0 ? (
                <span className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-red-500 px-1 text-center text-[10px] font-semibold leading-4 text-white">
                  {pendingCount > 99 ? "99+" : pendingCount}
                </span>
              ) : (
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
              )}
            </button>

            {panelOpen ? (
              <div className="absolute right-0 top-12 z-40 w-80 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Notifications</p>
                    <p className="text-xs text-slate-500">Rappels et activité récente</p>
                  </div>
                </div>

                {loading ? (
                  <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                    Chargement des notifications...
                  </p>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-center">
                        <p className="text-[11px] text-slate-500">Due soon</p>
                        <p className="text-sm font-semibold text-slate-800">
                          {summary?.invoiceDueSoonCount || 0}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-center">
                        <p className="text-[11px] text-slate-500">Overdue</p>
                        <p className="text-sm font-semibold text-rose-600">
                          {summary?.invoiceOverdueCount || 0}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-center">
                        <p className="text-[11px] text-slate-500">Devis</p>
                        <p className="text-sm font-semibold text-slate-800">
                          {summary?.quoteFollowupCount || 0}
                        </p>
                      </div>
                    </div>

                    {!summary?.reminderEnabled ? (
                      <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                        Les relances automatiques sont désactivées dans Paramètres.
                      </p>
                    ) : null}

                    <div className="mt-3 space-y-2">
                      {(summary?.recentLogs || []).length === 0 ? (
                        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                          Aucune notification recente.
                        </p>
                      ) : (
                        summary.recentLogs.slice(0, 5).map((item) => (
                          <div
                            key={item.id}
                            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                          >
                            <p className="text-xs font-semibold text-slate-800">
                              {formatReminderType(item.reminderType)}
                            </p>
                            <p className="truncate text-xs text-slate-500">
                              {item.recipientEmail || "Sans destinataire"}
                            </p>
                            <p className="text-[11px] text-slate-400">{formatDate(item.sentAt)}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : null}
          </div>

          <div className="hidden items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm sm:flex">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 font-heading text-sm font-semibold text-brand-600">
              {(user?.fullName || "K").slice(0, 1).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">{user?.fullName || "Admin"}</p>
              <p className="text-xs text-slate-500">
                {user?.agencyName || "Konzotech Agency"} - {user?.role || "admin"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
