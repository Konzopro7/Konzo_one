import { useEffect, useState } from "react";
import { Eye, Pencil, Trash2, Search, Users, Plus } from "lucide-react";
import toast from "react-hot-toast";
import api from "../lib/api.js";
import { formatCurrency, formatDate } from "../lib/format.js";
import Modal from "../components/Modal.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { useAuth } from "../hooks/useAuth.jsx";

const initialForm = {
  name: "",
  company: "",
  email: "",
  phone: "",
};

export default function ClientsPage() {
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState("");
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [activeClientId, setActiveClientId] = useState(null);
  const [activeClientDetail, setActiveClientDetail] = useState(null);

  const isEditing = Boolean(activeClientId);
  const normalizedSearch = search.trim().toLocaleLowerCase("fr");
  const filteredClients = clients.filter((client) =>
    [client.name, client.company, client.email, client.phone].some((value) =>
      String(value || "")
        .toLocaleLowerCase("fr")
        .includes(normalizedSearch),
    ),
  );

  async function loadData() {
    const { data } = await api.get("/clients");
    setClients(data);
  }

  useEffect(() => {
    let active = true;
    loadData()
      .catch(() => toast.error("Impossible de charger les clients."))
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  function openCreateModal() {
    setActiveClientId(null);
    setForm(initialForm);
    setModalOpen(true);
  }

  function openEditModal(client) {
    setActiveClientId(client.id);
    setForm({
      name: client.name,
      company: client.company || "",
      email: client.email,
      phone: client.phone || "",
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setActiveClientId(null);
    setForm(initialForm);
  }

  async function openDetail(clientId) {
    try {
      const { data } = await api.get(`/clients/${clientId}`);
      setActiveClientDetail(data);
      setDetailOpen(true);
    } catch (error) {
      toast.error("Impossible de charger l'historique client.");
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      if (isEditing) {
        await api.put(`/clients/${activeClientId}`, form);
        toast.success("Client mis à jour.");
      } else {
        await api.post("/clients", form);
        toast.success("Client ajouté.");
      }
      await loadData();
      closeModal();
    } catch (error) {
      toast.error(error.response?.data?.message || "Action impossible.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(clientId) {
    if (!isAdmin) {
      toast.error("Seuls les admins peuvent supprimer.");
      return;
    }
    if (!window.confirm("Supprimer ce client ?")) {
      return;
    }
    try {
      await api.delete(`/clients/${clientId}`);
      setClients((prev) => prev.filter((client) => client.id !== clientId));
      toast.success("Client supprimé.");
    } catch (error) {
      toast.error(error.response?.data?.message || "Suppression impossible.");
    }
  }

  return (
    <div className="space-y-5">
      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-xl font-semibold text-slate-900">
              Votre carnet de relations
            </h2>
            <p className="text-sm text-slate-500">
              Coordonnées, documents et historique : chaque client a sa place.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreateModal}
            className="btn-primary gap-2"
          >
            <Plus size={16} /> Ajouter un client
          </button>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Users size={17} className="text-teal-600" />
            Tous les clients{" "}
            <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-500">
              {loading ? "…" : clients.length}
            </span>
          </p>
          <div className="relative w-full sm:w-80">
            <Search
              size={16}
              className="absolute left-3 top-3.5 text-slate-400"
            />
            <input
              className="field-input pl-10"
              aria-label="Rechercher un client"
              placeholder="Nom, entreprise, email…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>
        {loading ? (
          <p className="text-sm text-slate-500">Chargement des clients...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-3">Client</th>
                  <th className="pb-3">Contact</th>
                  <th className="pb-3 text-center">Devis</th>
                  <th className="pb-3 text-center">Factures</th>
                  <th className="pb-3 text-right">Revenus payés</th>
                  <th className="pb-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.map((client) => (
                  <tr
                    key={client.id}
                    className="border-b border-slate-100 last:border-0"
                  >
                    <td className="py-3">
                      <p className="font-semibold text-slate-900">
                        {client.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {client.company || "Sans entreprise"}
                      </p>
                    </td>
                    <td className="py-3 text-xs text-slate-600">
                      <p>{client.email}</p>
                      <p>{client.phone || "-"}</p>
                    </td>
                    <td className="py-3 text-center font-semibold text-slate-800">
                      {client.quotesCount}
                    </td>
                    <td className="py-3 text-center font-semibold text-slate-800">
                      {client.invoicesCount}
                    </td>
                    <td className="py-3 text-right font-semibold text-brand-500">
                      {formatCurrency(client.paidTotal)}
                    </td>
                    <td className="py-3">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                          onClick={() => openDetail(client.id)}
                          title="Historique"
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                          onClick={() => openEditModal(client)}
                          title="Modifier"
                        >
                          <Pencil size={14} />
                        </button>
                        {isAdmin && (
                          <button
                            type="button"
                            className="rounded-lg border border-rose-200 p-2 text-rose-600 hover:bg-rose-50"
                            onClick={() => handleDelete(client.id)}
                            title="Supprimer"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filteredClients.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            {search.trim()
              ? "Aucun client ne correspond à votre recherche."
              : "Votre prochaine relation commence ici. Ajoutez votre premier client."}
          </div>
        )}
      </section>

      <Modal
        isOpen={modalOpen}
        title={isEditing ? "Modifier le client" : "Ajouter un client"}
        onClose={closeModal}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="field-label">Nom</label>
              <input
                className="field-input"
                value={form.name}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    name: event.target.value,
                  }))
                }
                required
              />
            </div>
            <div>
              <label className="field-label">Entreprise</label>
              <input
                className="field-input"
                value={form.company}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    company: event.target.value,
                  }))
                }
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
                    email: event.target.value,
                  }))
                }
                required
              />
            </div>
            <div>
              <label className="field-label">Téléphone</label>
              <input
                className="field-input"
                value={form.phone}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    phone: event.target.value,
                  }))
                }
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={closeModal}
            >
              Annuler
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving
                ? "Enregistrement..."
                : isEditing
                  ? "Mettre à jour"
                  : "Ajouter"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={detailOpen}
        title={`Historique - ${activeClientDetail?.name || ""}`}
        onClose={() => {
          setDetailOpen(false);
          setActiveClientDetail(null);
        }}
      >
        {activeClientDetail ? (
          <div className="space-y-5">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              <p className="font-semibold text-slate-900">
                {activeClientDetail.company || "Sans entreprise"}
              </p>
              <p className="text-slate-600">{activeClientDetail.email}</p>
              <p className="text-slate-600">
                {activeClientDetail.phone || "-"}
              </p>
            </div>

            <div>
              <h4 className="mb-2 font-heading text-base font-semibold text-slate-900">
                Devis
              </h4>
              <div className="space-y-2">
                {activeClientDetail.quotes.map((quote) => (
                  <div
                    key={quote.id}
                    className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2"
                  >
                    <div>
                      <p className="font-medium text-slate-800">
                        {quote.quoteNumber}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatDate(quote.issueDate)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={quote.status} />
                      <span className="font-semibold text-slate-900">
                        {formatCurrency(quote.total)}
                      </span>
                    </div>
                  </div>
                ))}
                {activeClientDetail.quotes.length === 0 && (
                  <p className="text-sm text-slate-500">
                    Aucun devis pour ce client.
                  </p>
                )}
              </div>
            </div>

            <div>
              <h4 className="mb-2 font-heading text-base font-semibold text-slate-900">
                Factures
              </h4>
              <div className="space-y-2">
                {activeClientDetail.invoices.map((invoice) => (
                  <div
                    key={invoice.id}
                    className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2"
                  >
                    <div>
                      <p className="font-medium text-slate-800">
                        {invoice.invoiceNumber}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatDate(invoice.issueDate)} - échéance{" "}
                        {formatDate(invoice.dueDate)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={invoice.status} />
                      <span className="font-semibold text-slate-900">
                        {formatCurrency(invoice.total)}
                      </span>
                    </div>
                  </div>
                ))}
                {activeClientDetail.invoices.length === 0 && (
                  <p className="text-sm text-slate-500">
                    Aucune facture pour ce client.
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
