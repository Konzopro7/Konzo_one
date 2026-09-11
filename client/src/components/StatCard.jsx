import { FileText, Receipt, Wallet, Users, UserRound } from "lucide-react";
import { formatCurrency } from "../lib/format.js";
export default function StatCard({
  title,
  value,
  type = "number",
  accent = false,
}) {
  const Icon =
    type === "currency"
      ? Wallet
      : /devis/i.test(title)
        ? FileText
        : /facture/i.test(title)
          ? Receipt
          : /quipe/i.test(title)
            ? Users
            : UserRound;
  return (
    <article className={`metric-card ${accent ? "metric-accent" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold">{title}</p>
        <span className="metric-icon">
          <Icon size={17} />
        </span>
      </div>
      <p className="metric-value">
        {type === "currency"
          ? formatCurrency(value)
          : Number(value || 0).toLocaleString("fr-CA")}
      </p>
      <p className="text-xs opacity-[.65]">
        {type === "currency"
          ? "Paiements encaissés · CAD"
          : "Dans votre espace de travail"}
      </p>
    </article>
  );
}
