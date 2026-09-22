import { useEffect, useMemo, useState } from "react";
import { Copy, FileDown, Pencil, RefreshCcw, Send, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import api from "../lib/api.js";
import { formatCurrency, formatDate, toInputDate } from "../lib/format.js";
import Modal from "../components/Modal.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import LineItemsEditor, {
  emptyLineItem,
  computeDraftTotals
} from "../components/LineItemsEditor.jsx";
import { useAuth } from "../hooks/useAuth.jsx";

const initialForm = {
  clientId: "",
  status: "draft",
  validUntil: "",
  taxRate: 0.2,
  notes: "",
  items: [{ ...emptyLineItem }]
};

const statusOptions = [
  { value: "draft", label: "Brouillon" },
  { value: "sent", label: "Envoyé" },
  { value: "accepted", label: "Accepté" },
  { value: "refused", label: "Refusé" }
];

function normalizeQuoteForForm(quote) {
  return {
    clientId: String(quote.client.id),
    status: quote.status,
    validUntil: toInputDate(quote.validUntil),
    taxRate: Number(quote.taxRate ?? 0.2),
    notes: quote.notes || "",
    items: quote.items.map((item) => ({
      description: item.description,
      unitPrice: Number(item.unitPrice),
      quantity: Number(item.quantity)
    }))
  };
}

export default function QuotesPage() {
  const { isAdmin } = useAuth();
  const [quotes, setQuotes] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeQuoteId, setActiveQuoteId] = useState(null);
  const [form, setForm] = useState(initialForm);

  const isEditing = Boolean(activeQuoteId);

  async function loadData() {
    const [quotesRes, clientsRes] = await Promise.all([api.get("/quotes"), api.get("/clients")]);
    setQuotes(quotesRes.data);
    setClients(clientsRes.data);
  }

  useEffect(() => {
    let active = true;
    loadData()
      .catch(() => toast.error("Impossible de charger les devis."))
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const totals = useMemo(() => computeDraftTotals(form.items, form.taxRate), [form]);

  function openCreateModal() {
    setActiveQuoteId(null);
    setForm(initialForm);
    setModalOpen(true);
  }

  async function openEditModal(quoteId) {
    try {
      const { data } = await api.get(`/quotes/${quoteId}`);
      setActiveQuoteId(quoteId);
      setForm(normalizeQuoteForForm(data));
      setModalOpen(true);
    } catch (error) {
      toast.error("Impossible de charger le devis.");
    }
  }

  function closeModal() {
    setModalOpen(false);
    setActiveQuoteId(null);
    setForm(initialForm);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!form.clientId) {
      toast.error("Sélectionne un client.");
      return;
    }

    if (!form.items.some((item) => item.description.trim().length > 0)) {
      toast.error("Ajoute au moins un service.");
      return;
    }

    const payload = {
      clientId: Number(form.clientId),
      status: form.status,
      validUntil: form.validUntil || null,
      taxRate: Number(form.taxRate),
      notes: form.notes || null,
      items: form.items
    };

    setSaving(true);
    try {
      if (isEditing) {
        await api.put(`/quotes/${activeQuoteId}`, payload);
        toast.success("Devis mis à jour.");
      } else {
        await api.post("/quotes", payload);
        toast.success("Devis créé.");
      }
      await loadData();
      closeModal();
    } catch (error) {
      toast.error(error.response?.data?.message || "Action impossible.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(quoteId) {
    if (!isAdmin) {
      toast.error("Seuls les admins peuvent supprimer.");
      return;
    }
    if (!window.confirm("Supprimer ce devis ?")) {
      return;
    }
    try {
      await api.delete(`/quotes/${quoteId}`);
      setQuotes((prev) => prev.filter((quote) => quote.id !== quoteId));
      toast.success("Devis supprimé.");
    } catch (error) {
      toast.error(error.response?.data?.message || "Suppression impossible.");
    }
  }

  async function handleStatusChange(quoteId, nextStatus) {
    try {
      const { data } = await api.patch(`/quotes/${quoteId}/status`, { status: nextStatus });
      setQuotes((prev) =>
        prev.map((quote) =>
          quote.id === quoteId
            ? {
                ...quote,
                status: data.status
              }
            : quote
        )
      );
      toast.success("Statut mis à jour.");
    } catch (error) {
      toast.error("Impossible de changer le statut.");
    }
  }

  async function handleConvertToInvoice(quoteId) {
    try {
      const { data } = await api.post(`/quotes/${quoteId}/convert-to-invoice`);
      toast.success(`Facture ${data.invoice.invoiceNumber} créée.`);
      await loadData();
    } catch (error) {
      toast.error(error.response?.data?.message || "Conversion impossible.");
    }
  }

  async function handleSendEmail(quoteId) {
    try {
      await api.post(`/quotes/${quoteId}/send-email`);
      toast.success("Devis envoyé par email.");
    } catch (error) {
      toast.error(error.response?.data?.message || "Envoi impossible.");
    }
  }

  async function handleCopyPublicLink(quoteId) {
    try {
      const { data } = await api.get(`/quotes/${quoteId}/public-link`);
      await navigator.clipboard.writeText(data.portalUrl);
      toast.success("Lien client copié.");
    } catch (error) {
      toast.error(error.response?.data?.message || "Impossible de copier le lien.");
    }
  }

  async function handleDownloadPdf(quote) {
    try {
      const response = await api.get(`/quotes/${quote.id}/pdf`, {
        responseType: "blob"
      });
      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${quote.quoteNumber}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error("Impossible de générer le PDF.");
    }
  }

  return (
    <div className="space-y-5">
      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-xl font-semibold text-slate-900">Gestion des devis</h2>
            <p className="text-sm text-slate-500">Crée, envoie et convertis tes devis en factures.</p>
          </div>
          <button type="button" onClick={openCreateModal} className="btn-primary">
            Nouveau devis
          </button>
        </div>
      </section>

      <section className="card overflow-hidden">
        {loading ? (
          <p className="text-sm text-slate-500">Chargement des devis...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-3">Devis</th>
                  <th className="pb-3">Client</th>
                  <th className="pb-3">Date</th>
                  <th className="pb-3">Statut</th>
                  <th className="pb-3 text-right">Montant</th>
                  <th className="pb-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((quote) => (
                  <tr key={quote.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-3 font-semibold text-slate-900">{quote.quoteNumber}</td>
                    <td className="py-3">
                      <p className="font-medium text-slate-800">{quote.client.name}</p>
                      <p className="text-xs text-slate-500">{quote.client.company || "Sans entreprise"}</p>
                    </td>
                    <td className="py-3 text-slate-600">{formatDate(quote.issueDate)}</td>
                    <td className="py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={quote.status} />
                        <select
                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600"
                          value={quote.status}
                          onChange={(event) => handleStatusChange(quote.id, event.target.value)}
                        >
                          {statusOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="py-3 text-right font-semibold text-slate-900">
                      {formatCurrency(quote.total)}
                    </td>
                    <td className="py-3">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                          onClick={() => openEditModal(quote.id)}
                          title="Modifier"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                          onClick={() => handleDownloadPdf(quote)}
                          title="PDF"
                        >
                          <FileDown size={14} />
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                          onClick={() => handleSendEmail(quote.id)}
                          title="Envoyer email"
                        >
                          <Send size={14} />
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                          onClick={() => handleCopyPublicLink(quote.id)}
                          title="Copier lien client"
                        >
                          <Copy size={14} />
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                          onClick={() => handleConvertToInvoice(quote.id)}
                          title="Convertir en facture"
                        >
                          <RefreshCcw size={14} />
                        </button>
                        {isAdmin && (
                          <button
                            type="button"
                            className="rounded-lg border border-rose-200 p-2 text-rose-600 hover:bg-rose-50"
                            onClick={() => handleDelete(quote.id)}
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

        {!loading && quotes.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            Aucun devis créé pour le moment.
          </div>
        )}
      </section>

      <Modal
        isOpen={modalOpen}
        title={isEditing ? "Modifier le devis" : "Créer un devis"}
        onClose={closeModal}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="field-label">Client</label>
              <select
                className="field-input"
                value={form.clientId}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    clientId: event.target.value
                  }))
                }
                required
              >
                <option value="">Sélectionner un client</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name} {client.company ? `(${client.company})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="field-label">Statut</label>
              <select
                className="field-input"
                value={form.status}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    status: event.target.value
                  }))
                }
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="field-label">Date limite</label>
              <input
                type="date"
                className="field-input"
                value={form.validUntil}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    validUntil: event.target.value
                  }))
                }
              />
            </div>

            <div>
              <label className="field-label">TVA (0 - 1)</label>
              <input
                type="number"
                min="0"
                max="1"
                step="0.01"
                className="field-input"
                value={form.taxRate}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    taxRate: Number(event.target.value || 0)
                  }))
                }
              />
            </div>
          </div>

          <div>
            <label className="field-label">Services</label>
            <LineItemsEditor
              items={form.items}
              taxRate={form.taxRate}
              onChange={(items) =>
                setForm((prev) => ({
                  ...prev,
                  items
                }))
              }
            />
          </div>

          <div>
            <label className="field-label">Notes</label>
            <textarea
              rows={3}
              className="field-textarea"
              value={form.notes}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  notes: event.target.value
                }))
              }
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <span className="text-slate-600">Total estimé: </span>
            <span className="font-heading text-xl font-semibold text-brand-500">
              {formatCurrency(totals.total)}
            </span>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={closeModal}>
              Annuler
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Enregistrement..." : isEditing ? "Mettre à jour" : "Créer le devis"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
