import {
  Bell,
  BookOpenText,
  BriefcaseBusiness,
  FileText,
  GitBranch,
  History,
  LayoutDashboard,
  MessageCircle,
  Boxes,
  ReceiptText,
  Receipt,
  CreditCard,
  Gauge,
  Settings,
  Shield,
  Users,
  X
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.jsx";

const baseLinks = [
  { to: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { to: "/pipeline", label: "Pipeline", icon: GitBranch },
  { to: "/billing", label: "Abonnement", icon: CreditCard },
  { to: "/quotes", label: "Devis", icon: FileText },
  { to: "/invoices", label: "Factures", icon: Receipt },
  { to: "/clients", label: "Clients", icon: Users },
  { to: "/messages", label: "Messages", icon: MessageCircle },
  { to: "/purchases", label: "Achats", icon: BriefcaseBusiness },
  { to: "/inventory", label: "Stock", icon: Boxes },
  { to: "/expenses", label: "Dépenses", icon: ReceiptText },
  { to: "/ledger", label: "Grand livre", icon: BookOpenText }
];

function MenuLink({ to, label, icon: Icon, onNavigate }) {
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      className={({ isActive }) =>
        [
          "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-all duration-200",
          isActive
            ? "bg-white/20 text-white shadow-sm"
            : "text-blue-100 hover:bg-white/10 hover:text-white"
        ].join(" ")
      }
    >
      <Icon size={18} className="opacity-90" />
      <span>{label}</span>
    </NavLink>
  );
}

export default function Sidebar({ open, onClose }) {
  const { user, logout } = useAuth();
  const logoSrc = `${import.meta.env.BASE_URL}logo.svg`;
  const links = [
    ...baseLinks,
    ...(user?.isPlatformAdmin
      ? [{ to: "/platform", label: "Admin SaaS", icon: Gauge }]
      : []),
    ...(user?.role === "admin"
      ? [{ to: "/team", label: "Équipe", icon: Shield }]
      : []),
    ...(user?.role === "admin"
      ? [{ to: "/activity", label: "Activité", icon: History }]
      : []),
    { to: "/settings", label: "Paramètres", icon: Settings }
  ];

  return (
    <>
      <div
        className={[
          "fixed inset-0 z-30 bg-slate-900/45 backdrop-blur-sm transition-opacity lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        ].join(" ")}
        onClick={onClose}
      />

      <aside
        className={[
          "fixed inset-y-0 left-0 z-40 w-72 overflow-hidden border-r border-white/10",
          "bg-gradient-to-b from-brand-500 via-brand-600 to-brand-900",
          "transition-transform duration-300 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        ].join(" ")}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between border-b border-white/10 px-5 py-5">
            <div className="flex items-center gap-3">
              <img
                src={logoSrc}
                alt="Konzotech Agency"
                width="36"
                height="36"
                className="h-9 w-9 rounded-lg object-contain"
              />
              <div>
                <p className="font-heading text-sm tracking-wide text-white">KONZOTECH</p>
                <p className="text-[10px] tracking-[0.32em] text-blue-100">AGENCY</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-blue-100 hover:bg-white/10 hover:text-white lg:hidden"
            >
              <X size={18} />
            </button>
          </div>

          <nav className="space-y-1 px-4 py-5">
            {links.map((link) => (
              <MenuLink
                key={link.to}
                to={link.to}
                label={link.label}
                icon={link.icon}
                onNavigate={onClose}
              />
            ))}
          </nav>

          <div className="mt-auto border-t border-white/10 px-4 py-4">
            <div className="mb-3 rounded-xl bg-white/10 px-3 py-2">
              <p className="text-xs text-blue-100">Connecté en tant que</p>
              <p className="mt-1 text-sm font-semibold text-white">{user?.fullName || "Admin"}</p>
              <p className="truncate text-xs text-blue-100">{user?.email}</p>
              <p className="text-xs uppercase tracking-wide text-blue-200">{user?.role}</p>
            </div>

            <button
              type="button"
              onClick={logout}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
            >
              <Bell size={15} />
              Déconnexion
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
