import clsx from "clsx";

const statusStyles = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  sent: "bg-blue-50 text-blue-700 border-blue-200",
  accepted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  refused: "bg-rose-50 text-rose-700 border-rose-200",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  paid: "bg-teal-50 text-teal-700 border-teal-200",
  ordered: "bg-indigo-50 text-indigo-700 border-indigo-200",
  received: "bg-cyan-50 text-cyan-700 border-cyan-200",
  cancelled: "bg-zinc-100 text-zinc-700 border-zinc-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-rose-50 text-rose-700 border-rose-200"
};

const labels = {
  draft: "Brouillon",
  sent: "Envoyé",
  accepted: "Accepté",
  refused: "Refusé",
  pending: "En attente",
  paid: "Payée",
  ordered: "Commandé",
  received: "Réceptionné",
  cancelled: "Annulé",
  approved: "Approuvée",
  rejected: "Rejetée"
};

export default function StatusBadge({ status }) {
  const key = String(status || "").toLowerCase();
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
        statusStyles[key] || "bg-slate-100 text-slate-700 border-slate-200"
      )}
    >
      {labels[key] || key || "-"}
    </span>
  );
}
