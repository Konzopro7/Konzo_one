import { formatCurrency } from "../lib/format.js";

export default function StatCard({ title, value, type = "number", accent = false }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft transition hover:-translate-y-0.5 hover:shadow-md">
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <p className={["mt-2 font-heading text-3xl font-semibold", accent ? "text-brand-500" : "text-slate-900"].join(" ")}>
        {type === "currency" ? formatCurrency(value) : value}
      </p>
    </article>
  );
}
