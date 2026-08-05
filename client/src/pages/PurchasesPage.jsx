import { useEffect, useMemo, useState } from "react";
import { FileDown, Pencil, Plus, Trash2 } from "lucide-react";
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

const initialPurchaseForm = {
  supplierId: "",
  status: "draft",
  dueDate: "",
  paymentMethod: "virement",
  taxRate: 0.2,
  notes: "",
  items: [{ ...emptyLineItem }]
};

const initialSupplierForm = {
  name: "",
  company: "",
  email: "",
  phone: ""
};

const purchaseStatusOptions = [
  { value: "draft", label: "Brouillon" },
  { value: "ordered", label: "Commande" },
  { value: "received", label: "Réceptionné" },
  { value: "paid", label: "Paye" },
  { value: "cancelled", label: "Annule" }
];

function normalizePurchaseForForm(purchase) {
  return {
    supplierId: String(purchase.supplier.id),
    status: purchase.status,
    dueDate: toInputDate(purchase.dueDate),
    paymentMethod: purchase.paymentMethod || "",
    taxRate: Number(purchase.taxRate || 0.2),
    notes: purchase.notes || "",
    items: purchase.items.map((item) => ({
      description: item.description,
      unitPrice: Number(item.unitPrice),
      quantity: Number(item.quantity)
    }))
  };
}

export default function PurchasesPage() {
  const { isAdmin } = useAuth();
  const [purchases, setPurchases] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [activePurchaseId, setActivePurchaseId] = useState(null);
  const [form, setForm] = useState(initialPurchaseForm);
  const [supplierForm, setSupplierForm] = useState(initialSupplierForm);

  const isEditing = Boolean(activePurchaseId);
  const totals = useMemo(() => computeDraftTotals(form.items, form.taxRate), [form]);

  async function loadData() {
    const [purchasesRes, suppliersRes] = await Promise.all([
      api.get("/purchases"),
      api.get("/suppliers")
    ]);
    setPurchases(purchasesRes.data);
    setSuppliers(suppliersRes.data);
  }

  useEffect(() => {
    let active = true;
    loadData()
      .catch(() => toast.error("Impossible de charger les achats."))
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
    setActivePurchaseId(null);
    setForm(initialPurchaseForm);
    setModalOpen(true);
  }

  async function openEditModal(purchaseId) {
    try {
      const { data } = await api.get(`/purchases/${purchaseId}`);
      setActivePurchaseId(purchaseId);
      setForm(normalizePurchaseForForm(data));
      setModalOpen(true);
    } catch (error) {
      toast.error("Impossible de charger l'achat.");
    }
  }

  function closeModal() {
    setModalOpen(false);
    setActivePurchaseId(null);
    setForm(initialPurchaseForm);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!form.supplierId) {
      toast.error("Selectionne un fournisseur.");
      return;
    }
    if (!form.items.some((item) => item.description.trim())) {
      toast.error("Ajoute au moins une ligne d'achat.");
      return;
    }

    const payload = {
      supplierId: Number(form.supplierId),
      status: form.status,
      dueDate: form.dueDate || null,
      paymentMethod: form.paymentMethod || null,
      taxRate: Number(form.taxRate),
      notes: form.notes || null,
      items: form.items
    };

    setSaving(true);
    try {
      if (isEditing) {
        await api.put(`/purchases/${activePurchaseId}`, payload);
        toast.success("Achat mis à jour.");
      } else {
        await api.post("/purchases", payload);
        toast.success("Achat cree.");
      }
      await loadData();
      closeModal();
    } catch (error) {
      toast.error(error.response?.data?.message || "Action impossible.");
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(purchaseId, nextStatus) {
    try {
      const { data } = await api.patch(`/purchases/${purchaseId}/status`, {
        status: nextStatus
      });
      setPurchases((prev) =>
        prev.map((purchase) =>
          purchase.id === purchaseId
            ? {
                ...purchase,
                status: data.status
              }
            : purchase
        )
      );
      toast.success("Statut mis à jour.");
    } catch (error) {
      toast.error(error.response?.data?.message || "Mise a jour impossible.");
    }
  }

  async function handleDelete(purchaseId) {
    if (!isAdmin) {
      toast.error("Seuls les admins peuvent supprimer.");
      return;
    }
    if (!window.confirm("Supprimer cet achat ?")) {
      return;
    }

    try {
      await api.delete(`/purchases/${purchaseId}`);
      setPurchases((prev) => prev.filter((purchase) => purchase.id !== purchaseId));
      toast.success("Achat supprime.");
    } catch (error) {
      toast.error(error.response?.data?.message || "Suppression impossible.");
    }
  }

  async function handleDownloadPdf(purchase) {
    try {
      const response = await api.get(`/purchases/${purchase.id}/pdf`, {
        responseType: "blob"
      });
      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${purchase.purchaseNumber}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error("Impossible de generer le PDF.");
    }
  }

  async function handleCreateSupplier(event) {
    event.preventDefault();
    setSavingSupplier(true);
    try {
      const { data } = await api.post("/suppliers", supplierForm);
      setSuppliers((prev) => [data, ...prev]);
      setForm((prev) => ({
        ...prev,
        supplierId: String(data.id)
      }));
      setSupplierForm(initialSupplierForm);
      setSupplierModalOpen(false);
      toast.success("Fournisseur ajouté.");
    } catch (error) {
      toast.error(error.response?.data?.message || "Création fournisseur impossible.");
    } finally {
      setSavingSupplier(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-xl font-semibold text-slate-900">Achats fournisseurs</h2>
            <p className="text-sm text-slate-500">
              Centralise les achats, statuts de reception et paiements sortants.
            </p>
          </div>
          <button type="button" onClick={openCreateModal} className="btn-primary">
            Nouvel achat
          </button>
        </div>
      </section>

      <section className="card overflow-hidden">
        {loading ? (
          <p className="text-sm text-slate-500">Chargement des achats...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-3">Achat</th>
                  <th className="pb-3">Fournisseur</th>
                  <th className="pb-3">Dates</th>
                  <th className="pb-3">Statut</th>
                  <th className="pb-3 text-right">Total</th>
                  <th className="pb-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((purchase) => (
                  <tr key={purchase.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-3 font-semibold text-slate-900">{purchase.purchaseNumber}</td>
                    <td className="py-3">
                      <p className="font-medium text-slate-800">{purchase.supplier.name}</p>
                      <p className="text-xs text-slate-500">
                        {purchase.supplier.company || "Sans entreprise"}
                      </p>
                    </td>
                    <td className="py-3 text-xs text-slate-600">
                      <p>Emission: {formatDate(purchase.issueDate)}</p>
                      <p>Echeance: {formatDate(purchase.dueDate)}</p>
                    </td>
                    <td className="py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={purchase.status} />
                        <select
                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600"
                          value={purchase.status}
                          onChange={(event) =>
                            handleStatusChange(purchase.id, event.target.value)
                          }
                        >
                          {purchaseStatusOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="py-3 text-right font-semibold text-slate-900">
                      {formatCurrency(purchase.total)}
                    </td>
                    <td className="py-3">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                          onClick={() => openEditModal(purchase.id)}
                          title="Modifier"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                          onClick={() => handleDownloadPdf(purchase)}
                          title="PDF"
                        >
                          <FileDown size={14} />
                        </button>
                        {isAdmin && (
                          <button
                            type="button"
                            className="rounded-lg border border-rose-200 p-2 text-rose-600 hover:bg-rose-50"
                            onClick={() => handleDelete(purchase.id)}
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
      </section>

      <Modal
        isOpen={modalOpen}
        title={isEditing ? "Modifier un achat" : "Créer un achat"}
        onClose={closeModal}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="field-label">Fournisseur</label>
              <div className="flex gap-2">
                <select
                  className="field-input"
                  value={form.supplierId}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      supplierId: event.target.value
                    }))
                  }
                  required
                >
                  <option value="">Selectionner</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name} {supplier.company ? `(${supplier.company})` : ""}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn-secondary px-3"
                  onClick={() => setSupplierModalOpen(true)}
                  title="Nouveau fournisseur"
                >
                  <Plus size={14} />
                </button>
              </div>
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
                {purchaseStatusOptions.map((option) => (
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
                value={form.dueDate}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    dueDate: event.target.value
                  }))
                }
              />
            </div>
            <div>
              <label className="field-label">Mode de paiement</label>
              <input
                className="field-input"
                value={form.paymentMethod}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    paymentMethod: event.target.value
                  }))
                }
              />
            </div>
            <div className="sm:col-span-2">
              <label className="field-label">Taxe (0 - 1)</label>
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
            <label className="field-label">Lignes d'achat</label>
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
            <span className="text-slate-600">Total previsionnel: </span>
            <span className="font-heading text-xl font-semibold text-brand-500">
              {formatCurrency(totals.total)}
            </span>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={closeModal}>
              Annuler
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Enregistrement..." : isEditing ? "Mettre à jour" : "Créer l'achat"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={supplierModalOpen}
        title="Nouveau fournisseur"
        onClose={() => setSupplierModalOpen(false)}
      >
        <form onSubmit={handleCreateSupplier} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="field-label">Nom</label>
              <input
                className="field-input"
                value={supplierForm.name}
                onChange={(event) =>
                  setSupplierForm((prev) => ({
                    ...prev,
                    name: event.target.value
                  }))
                }
                required
              />
            </div>
            <div>
              <label className="field-label">Entreprise</label>
              <input
                className="field-input"
                value={supplierForm.company}
                onChange={(event) =>
                  setSupplierForm((prev) => ({
                    ...prev,
                    company: event.target.value
                  }))
                }
              />
            </div>
            <div>
              <label className="field-label">Email</label>
              <input
                type="email"
                className="field-input"
                value={supplierForm.email}
                onChange={(event) =>
                  setSupplierForm((prev) => ({
                    ...prev,
                    email: event.target.value
                  }))
                }
              />
            </div>
            <div>
              <label className="field-label">Téléphone</label>
              <input
                className="field-input"
                value={supplierForm.phone}
                onChange={(event) =>
                  setSupplierForm((prev) => ({
                    ...prev,
                    phone: event.target.value
                  }))
                }
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setSupplierModalOpen(false)}
            >
              Annuler
            </button>
            <button type="submit" className="btn-primary" disabled={savingSupplier}>
              {savingSupplier ? "Ajout..." : "Ajouter"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
