import { useEffect, useState } from "react";
import { Copy, CreditCard, FileDown, Pencil, Send, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import api from "../lib/api.js";
import { formatCurrency, formatDate, toInputDate } from "../lib/format.js";
import Modal from "../components/Modal.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import LineItemsEditor, {
  emptyLineItem,
} from "../components/LineItemsEditor.jsx";
import { useAuth } from "../hooks/useAuth.jsx";
import useAsyncAction from "../hooks/useAsyncAction.js";
import { apiErrorMessage, documentFormError } from "../lib/formErrors.js";

const initialForm = {
  clientId: "",
  status: "pending",
  dueDate: "",
  paymentMethod: "bank_transfer",
  taxRate: 0.2,
  items: [{ ...emptyLineItem }],
};

const statusOptions = [
  { value: "pending", label: "En attente" },
  { value: "paid", label: "Payée" },
];

function normalizeInvoiceForForm(invoice) {
  return {
    clientId: String(invoice.client.id),
    status: invoice.status,
    dueDate: toInputDate(invoice.dueDate),
    paymentMethod: invoice.paymentMethod || "",
    taxRate: Number(invoice.taxRate ?? 0.2),
    items: invoice.items.map((item) => ({
      description: item.description,
      unitPrice: Number(item.unitPrice),
      quantity: Number(item.quantity),
    })),
  };
}

export default function InvoicesPage() {
  const { isAdmin, isCommercial, isFinance } = useAuth();
  const canWrite = isAdmin || isCommercial || isFinance;
  const { busy, runAction } = useAsyncAction();
  const [loadError, setLoadError] = useState(false);
  const [invoices, setInvoices] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeInvoiceId, setActiveInvoiceId] = useState(null);
  const [form, setForm] = useState(initialForm);

  const isEditing = Boolean(activeInvoiceId);

  async function loadData() {
    const [invoicesRes, clientsRes] = await Promise.all([
      api.get("/invoices"),
      api.get("/clients"),
    ]);
    setInvoices(invoicesRes.data);
    setClients(clientsRes.data);
    setLoadError(false);
  }

  useEffect(() => {
    let active = true;
    loadData()
      .catch(() => {
        setLoadError(true);
        toast.error("Impossible de charger les factures.");
      })
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
    if (!canWrite) return;
    setActiveInvoiceId(null);
    setForm(initialForm);
    setModalOpen(true);
  }

  async function openEditModal(invoiceId) {
    if (!canWrite) return;
    try {
      const { data } = await api.get(`/invoices/${invoiceId}`);
      setActiveInvoiceId(invoiceId);
      setForm(normalizeInvoiceForForm(data));
      setModalOpen(true);
    } catch (error) {
      toast.error("Impossible de charger la facture.");
    }
  }

  function closeModal() {
    if (saving) return;
    setModalOpen(false);
    setActiveInvoiceId(null);
    setForm(initialForm);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (saving || !canWrite) return;
    const validationError = documentFormError(form);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    const payload = {
      clientId: Number(form.clientId),
      status: form.status,
      dueDate: form.dueDate || null,
      paymentMethod: form.paymentMethod || null,
      taxRate: Number(form.taxRate),
      items: form.items,
    };

    setSaving(true);
    try {
      if (isEditing) {
        await api.put(`/invoices/${activeInvoiceId}`, payload);
        toast.success("Facture mise à jour.");
      } else {
        await api.post("/invoices", payload);
        toast.success("Facture créée.");
      }
      setModalOpen(false);
      setActiveInvoiceId(null);
      setForm(initialForm);
      await loadData().catch(() => {
        setLoadError(true);
        toast.error(
          "Facture enregistrée. Impossible d’actualiser la liste. Réessayez.",
        );
      });
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(invoiceId) {
    if (!isAdmin) {
      toast.error("Seuls les admins peuvent supprimer.");
      return;
    }
    if (!window.confirm("Supprimer cette facture ?")) {
      return;
    }
    try {
      await api.delete(`/invoices/${invoiceId}`);
      setInvoices((prev) => prev.filter((invoice) => invoice.id !== invoiceId));
      toast.success("Facture supprimée.");
    } catch (error) {
      toast.error(error.response?.data?.message || "Suppression impossible.");
    }
  }

  async function handleStatusChange(invoiceId, nextStatus) {
    try {
      const { data } = await api.patch(`/invoices/${invoiceId}/status`, {
        status: nextStatus,
      });
      setInvoices((prev) =>
        prev.map((invoice) =>
          invoice.id === invoiceId
            ? {
                ...invoice,
                status: data.status,
              }
            : invoice,
        ),
      );
      toast.success("Statut mis à jour.");
    } catch (error) {
      toast.error("Impossible de changer le statut.");
    }
  }

  async function handleDownloadPdf(invoice) {
    try {
      const response = await api.get(`/invoices/${invoice.id}/pdf`, {
        responseType: "blob",
      });
      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${invoice.invoiceNumber}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error("Impossible de générer le PDF.");
    }
  }

  async function handleStripeCheckout(invoiceId) {
    try {
      const { data } = await api.post(
        `/payments/invoices/${invoiceId}/checkout-session`,
      );
      if (data.checkoutUrl) {
        window.location.assign(data.checkoutUrl);
      }
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Paiement Stripe indisponible.",
      );
    }
  }

  async function handleCopyPublicLink(invoiceId) {
    try {
      const { data } = await api.get(
        `/payments/invoices/${invoiceId}/public-link`,
      );
      await navigator.clipboard.writeText(
        data.portalUrl || data.publicCheckoutEndpoint,
      );
      toast.success("Lien client copié.");
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Impossible de copier le lien.",
      );
    }
  }

  async function handleSendEmail(invoiceId) {
    try {
      await api.post(`/invoices/${invoiceId}/send-email`);
      toast.success("Facture envoyée par email.");
      await loadData().catch(() => setLoadError(true));
    } catch (error) {
      toast.error(error.response?.data?.message || "Envoi impossible.");
    }
  }

  return (
    <div className="space-y-5">
      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-xl font-semibold text-slate-900">
              Gestion des factures
            </h2>
            <p className="text-sm text-slate-500">
              Numérotation automatique, statut de paiement et encaissement
              Stripe.
            </p>
          </div>
          {canWrite && (
            <button
              data-tour="invoice-create"
              type="button"
              disabled={busy || loadError || loading}
              onClick={openCreateModal}
              className="btn-primary"
            >
              Nouvelle facture
            </button>
          )}
        </div>
      </section>

      <section className="card overflow-hidden">
        {loadError ? (
          <p role="alert" className="text-sm text-slate-600">
            Impossible de charger les factures.{" "}
            <button
              type="button"
              className="btn-secondary"
              disabled={busy}
              onClick={() =>
                runAction(() => loadData().catch(() => setLoadError(true)))
              }
            >
              Réessayer
            </button>
          </p>
        ) : loading ? (
          <p className="text-sm text-slate-500">Chargement des factures...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead data-tour="invoices-list">
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-3">Facture</th>
                  <th className="pb-3">Client</th>
                  <th className="pb-3">Dates</th>
                  <th className="pb-3">Statut</th>
                  <th className="pb-3 text-right">Montant</th>
                  <th className="pb-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr
                    key={invoice.id}
                    className="border-b border-slate-100 last:border-0"
                  >
                    <td className="py-3 font-semibold text-slate-900">
                      {invoice.invoiceNumber}
                    </td>
                    <td className="py-3">
                      <p className="font-medium text-slate-800">
                        {invoice.client.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {invoice.client.company || "Sans entreprise"}
                      </p>
                    </td>
                    <td className="py-3 text-xs text-slate-600">
                      <p>Émise : {formatDate(invoice.issueDate)}</p>
                      <p>Échéance : {formatDate(invoice.dueDate)}</p>
                    </td>
                    <td className="py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={invoice.status} />
                        {canWrite && (
                          <select
                            className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600"
                            value={invoice.status}
                            aria-label={`Statut de facture ${invoice.invoiceNumber}`}
                            disabled={busy}
                            onChange={(event) => {
                              const value = event.target.value;
                              runAction(() =>
                                handleStatusChange(invoice.id, value),
                              );
                            }}
                          >
                            {statusOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </td>
                    <td className="py-3 text-right font-semibold text-slate-900">
                      {formatCurrency(invoice.total)}
                    </td>
                    <td className="py-3">
                      <div className="flex justify-end gap-1.5">
                        {canWrite && (
                          <button
                            type="button"
                            className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                            onClick={() =>
                              runAction(() => openEditModal(invoice.id))
                            }
                            title="Modifier"
                            aria-label="Modifier"
                            disabled={busy}
                          >
                            <Pencil size={14} />
                          </button>
                        )}
                        <button
                          type="button"
                          className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                          onClick={() =>
                            runAction(() => handleDownloadPdf(invoice))
                          }
                          title="PDF"
                          aria-label="PDF"
                          disabled={busy}
                        >
                          <FileDown size={14} />
                        </button>
                        {canWrite && (
                          <button
                            type="button"
                            className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                            onClick={() =>
                              runAction(() => handleSendEmail(invoice.id))
                            }
                            title="Envoyer email"
                            aria-label="Envoyer email"
                            disabled={busy}
                          >
                            <Send size={14} />
                          </button>
                        )}
                        {invoice.status !== "paid" && (
                          <>
                            {canWrite && (
                              <button
                                type="button"
                                className="rounded-lg border border-brand-200 p-2 text-brand-600 hover:bg-brand-50"
                                onClick={() =>
                                  runAction(() =>
                                    handleStripeCheckout(invoice.id),
                                  )
                                }
                                title="Payer via Stripe"
                                aria-label="Payer via Stripe"
                                disabled={busy}
                              >
                                <CreditCard size={14} />
                              </button>
                            )}
                            <button
                              type="button"
                              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                              onClick={() =>
                                runAction(() =>
                                  handleCopyPublicLink(invoice.id),
                                )
                              }
                              title="Copier lien de paiement"
                              aria-label="Copier lien de paiement"
                              disabled={busy}
                            >
                              <Copy size={14} />
                            </button>
                          </>
                        )}
                        {isAdmin && (
                          <button
                            type="button"
                            className="rounded-lg border border-rose-200 p-2 text-rose-600 hover:bg-rose-50"
                            onClick={() =>
                              runAction(() => handleDelete(invoice.id))
                            }
                            title="Supprimer"
                            aria-label="Supprimer"
                            disabled={busy}
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

        {!loading && !loadError && invoices.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            Aucune facture créée pour le moment.
          </div>
        )}
      </section>

      <Modal
        isOpen={modalOpen}
        title={isEditing ? "Modifier la facture" : "Créer une facture"}
        onClose={closeModal}
        closeDisabled={saving}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            runAction(() => handleSubmit(event));
          }}
          aria-busy={saving}
          className="space-y-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="field-label" htmlFor="invoice-clientId">
                Client
              </label>
              <select
                id="invoice-clientId"
                disabled={saving}
                className="field-input"
                value={form.clientId}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    clientId: event.target.value,
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
              <label className="field-label" htmlFor="invoice-status">
                Statut
              </label>
              <select
                id="invoice-status"
                disabled={saving}
                className="field-input"
                value={form.status}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    status: event.target.value,
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
              <label className="field-label" htmlFor="invoice-dueDate">
                Date limite
              </label>
              <input
                id="invoice-dueDate"
                disabled={saving}
                type="date"
                className="field-input"
                value={form.dueDate}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    dueDate: event.target.value,
                  }))
                }
              />
            </div>

            <div>
              <label className="field-label" htmlFor="invoice-paymentMethod">
                Mode de paiement
              </label>
              <input
                id="invoice-paymentMethod"
                disabled={saving}
                className="field-input"
                value={form.paymentMethod}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    paymentMethod: event.target.value,
                  }))
                }
              />
            </div>

            <div className="sm:col-span-2">
              <label className="field-label" htmlFor="invoice-taxRate">
                Taux de taxe (%)
              </label>
              <input
                id="invoice-taxRate"
                disabled={saving}
                type="number"
                min="0"
                max="100"
                step="0.001"
                className="field-input"
                value={Number((Number(form.taxRate) * 100).toFixed(6))}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    taxRate: Number(event.target.value || 0) / 100,
                  }))
                }
              />
            </div>
          </div>

          <div>
            <label className="field-label">Services</label>
            <LineItemsEditor
              disabled={saving}
              items={form.items}
              taxRate={form.taxRate}
              onChange={(items) =>
                setForm((prev) => ({
                  ...prev,
                  items,
                }))
              }
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-secondary"
              disabled={saving}
              onClick={closeModal}
            >
              Annuler
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving
                ? "Enregistrement..."
                : isEditing
                  ? "Mettre à jour"
                  : "Créer la facture"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
