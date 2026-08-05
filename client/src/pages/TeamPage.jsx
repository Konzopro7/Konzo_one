import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import api from "../lib/api.js";
import { useAuth } from "../hooks/useAuth.jsx";
import { formatDate } from "../lib/format.js";

const initialMemberForm = {
  fullName: "",
  email: "",
  password: "",
  role: "commercial"
};

const roleLabels = {
  admin: "Admin",
  commercial: "Commercial",
  finance: "Finance",
  readonly: "Lecture seule"
};

const roleOptions = [
  ["commercial", "Commercial"],
  ["finance", "Finance"],
  ["readonly", "Lecture seule"],
  ["admin", "Admin"]
];

export default function TeamPage() {
  const { user, isAdmin } = useAuth();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(initialMemberForm);

  async function loadMembers() {
    const { data } = await api.get("/team");
    setMembers(data);
  }

  useEffect(() => {
    let active = true;
    loadMembers()
      .catch(() => toast.error("Impossible de charger l'équipe."))
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleCreate(event) {
    event.preventDefault();
    setCreating(true);
    try {
      await api.post("/team", form);
      toast.success("Membre ajouté.");
      setForm(initialMemberForm);
      await loadMembers();
    } catch (error) {
      toast.error(error.response?.data?.message || "Création impossible.");
    } finally {
      setCreating(false);
    }
  }

  async function handleRole(memberId, role) {
    try {
      await api.patch(`/team/${memberId}/role`, { role });
      toast.success("Rôle mis à jour.");
      await loadMembers();
    } catch (error) {
      toast.error(error.response?.data?.message || "Mise a jour impossible.");
    }
  }

  async function handleActive(memberId, isActive) {
    try {
      await api.patch(`/team/${memberId}/active`, { isActive });
      toast.success("Statut du compte mis à jour.");
      await loadMembers();
    } catch (error) {
      toast.error(error.response?.data?.message || "Action impossible.");
    }
  }

  if (!isAdmin) {
    return (
      <section className="card">
        <h2 className="font-heading text-xl font-semibold text-slate-900">Équipe et rôles</h2>
        <p className="mt-2 text-sm text-slate-600">
          Cette section est réservée aux administrateurs.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="card">
        <h2 className="font-heading text-xl font-semibold text-slate-900">Gestion de l'équipe</h2>
        <p className="mt-1 text-sm text-slate-500">
          Ajoute des comptes commerciaux, finance, lecture seule ou admins pour travailler sur la même agence.
        </p>
      </section>

      <section className="card">
        <h3 className="font-heading text-lg font-semibold text-slate-900">Ajouter un membre</h3>
        <form onSubmit={handleCreate} className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="field-label">Nom complet</label>
            <input
              className="field-input"
              value={form.fullName}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  fullName: event.target.value
                }))
              }
              required
            />
          </div>
          <div>
            <label className="field-label">Email</label>
            <input
              type="email"
              className="field-input"
              value={form.email}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  email: event.target.value
                }))
              }
              required
            />
          </div>
          <div>
            <label className="field-label">Mot de passe initial</label>
            <input
              type="password"
              className="field-input"
              value={form.password}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  password: event.target.value
                }))
              }
              minLength={8}
              required
            />
          </div>
          <div>
            <label className="field-label">Rôle</label>
            <select
              className="field-input"
              value={form.role}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  role: event.target.value
                }))
              }
            >
              {roleOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className="btn-primary" disabled={creating}>
              {creating ? "Création..." : "Ajouter le membre"}
            </button>
          </div>
        </form>
      </section>

      <section className="card overflow-hidden">
        <h3 className="font-heading text-lg font-semibold text-slate-900">Membres actifs</h3>
        {loading ? (
          <p className="mt-3 text-sm text-slate-500">Chargement...</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-3">Membre</th>
                  <th className="pb-3">Rôle</th>
                  <th className="pb-3">État</th>
                  <th className="pb-3">Ajouté le</th>
                  <th className="pb-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-3">
                      <p className="font-semibold text-slate-900">{member.fullName}</p>
                      <p className="text-xs text-slate-500">{member.email}</p>
                    </td>
                    <td className="py-3">
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                        {roleLabels[member.role] || member.role}
                      </span>
                    </td>
                    <td className="py-3">
                      <span
                        className={[
                          "rounded-full px-2 py-1 text-xs font-semibold",
                          member.isActive
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-rose-50 text-rose-700"
                        ].join(" ")}
                      >
                        {member.isActive ? "Actif" : "Inactif"}
                      </span>
                    </td>
                    <td className="py-3 text-slate-600">{formatDate(member.createdAt)}</td>
                    <td className="py-3">
                      <div className="flex justify-end gap-2">
                        <select
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                          value={member.role}
                          onChange={(event) => handleRole(member.id, event.target.value)}
                          disabled={member.id === user?.id}
                        >
                          {roleOptions.map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className={member.isActive ? "btn-secondary" : "btn-primary"}
                          onClick={() => handleActive(member.id, !member.isActive)}
                          disabled={member.id === user?.id}
                        >
                          {member.isActive ? "Désactiver" : "Activer"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
