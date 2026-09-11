import {
  LayoutDashboard,
  GitBranch,
  FileText,
  Receipt,
  Users,
  MessageCircle,
  BriefcaseBusiness,
  Boxes,
  ReceiptText,
  BookOpenText,
  CreditCard,
  Settings,
  Shield,
  History,
  Gauge,
  X,
  LogOut,
  ArrowUpRight,
  Layers,
} from "lucide-react";
import { NavLink, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.jsx";
export const navigation = [
  {
    label: "Vue d’ensemble",
    items: [["/dashboard", "Tableau de bord", LayoutDashboard]],
  },
  {
    label: "Relation client",
    items: [
      ["/pipeline", "Pipeline", GitBranch],
      ["/clients", "Clients", Users],
      ["/quotes", "Devis", FileText],
      ["/invoices", "Factures", Receipt],
      ["/messages", "Messages", MessageCircle],
    ],
  },
  {
    label: "Finance & opérations",
    items: [
      ["/purchases", "Achats", BriefcaseBusiness],
      ["/expenses", "Dépenses", ReceiptText],
      ["/inventory", "Stock", Boxes],
      ["/ledger", "Grand livre", BookOpenText],
    ],
  },
  {
    label: "Espace de travail",
    items: [
      ["/team", "Équipe", Shield, "admin"],
      ["/activity", "Activité", History, "admin"],
      ["/billing", "Abonnement", CreditCard],
      ["/settings", "Paramètres", Settings],
      ["/platform", "Admin SaaS", Gauge, "platform"],
    ],
  },
];
export function canSee(item, user) {
  return (
    !item[3] ||
    (item[3] === "admin" ? user?.role === "admin" : user?.isPlatformAdmin)
  );
}
export default function Sidebar({ open, onClose }) {
  const { user, logout } = useAuth();
  return (
    <>
      {open && (
        <button
          className="fixed inset-0 z-30 bg-slate-950/40 backdrop-blur-sm lg:hidden"
          aria-label="Fermer la navigation"
          onClick={onClose}
        />
      )}
      <aside className={`app-sidebar ${open ? "is-open" : ""}`}>
        <Link to="/dashboard" className="sidebar-brand" onClick={onClose}>
          <span className="brand-mark">
            <Layers size={23} />
          </span>
          <span>
            Konzotech<span className="brand-one">ONE · WORKSPACE</span>
          </span>
        </Link>
        <button
          className="absolute right-4 top-6 text-slate-400 lg:hidden"
          onClick={onClose}
          aria-label="Fermer le menu"
        >
          <X size={20} />
        </button>
        <div className="workspace-chip">
          <span className="workspace-avatar">
            {(user?.agencyName || "K").slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">
              {user?.agencyName || "Mon agence"}
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              Espace professionnel
            </p>
          </div>
        </div>
        <nav className="sidebar-nav" aria-label="Navigation principale">
          {navigation.map((group) => (
            <div key={group.label} className="nav-group">
              <p className="nav-group-label">{group.label}</p>
              {group.items
                .filter((item) => canSee(item, user))
                .map(([to, label, Icon]) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={onClose}
                    className={({ isActive }) =>
                      `sidebar-link ${isActive ? "active" : ""}`
                    }
                  >
                    <Icon size={17} strokeWidth={1.7} />
                    <span>{label}</span>
                  </NavLink>
                ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <Link
            to="/billing"
            onClick={onClose}
            className="flex items-center justify-between gap-2 text-xs text-slate-300"
          >
            <span>
              Votre plan{" "}
              <strong className="ml-1 uppercase text-teal-300">
                {user?.subscription?.planTier || "pro"}
              </strong>
            </span>
            <ArrowUpRight size={15} />
          </Link>
          <button
            onClick={logout}
            className="mt-4 flex items-center gap-2 text-xs text-slate-400 transition hover:text-white"
          >
            <LogOut size={15} /> Se déconnecter
          </button>
        </div>
      </aside>
    </>
  );
}
