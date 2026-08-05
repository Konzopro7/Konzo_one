import { useEffect, useState } from "react";
import { Link2, Pencil, Trash2, Upload } from "lucide-react";
import toast from "react-hot-toast";
import api from "../lib/api.js";
import { uploadFile } from "../lib/uploads.js";
import { formatCurrency, formatDate, toInputDate } from "../lib/format.js";
import Modal from "../components/Modal.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { useAuth } from "../hooks/useAuth.jsx";

const initialExpenseForm = {
  supplierId: "",
  status: "pending",
  expenseDate: "",
  category: "Marketing",
  paymentMethod: "carte",
  amount: 0,
  taxRate: 0,
  notes: "",
  receiptUrl: ""
};

const expenseStatusOptions = [
  { value: "pending", label: "En attente" },
  { value: "approved", label: "Approuvée" },
  { value: "paid", label: "Payée" },
  { value: "rejected", label: "Rejetée" }
];

const defaultCategories = [
  "Marketing",
  "Outils SaaS",
  "Infrastructure",
  "Sous-traitance",
  "Transport",
  "Administration",
  "Autre"
];

function normalizeExpenseForForm(expense) {
  return {
    supplierId: expense.supplier?.id ? String(expense.supplier.id) : "",
    status: expense.status,
    expenseDate: toInputDate(expense.expenseDate),
    category: expense.category || "Autre",
    paymentMethod: expense.paymentMethod || "",
    amount: Number(expense.amount || 0),
    taxRate: Number(expense.taxRate || 0),
    notes: expense.notes || "",
    receiptUrl: expense.receiptUrl || ""
  };
}

export default function ExpensesPage() {
  const { isAdmin } = useAuth();
  const [expenses, setExpenses] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [activeExpenseId, setActiveExpenseId] = useState(null);
  const [form, setForm] = useState(initialExpenseForm);

  const isEditing = Boolean(activeExpenseId);

  async function loadData() {
    const [expensesRes, suppliersRes] = await Promise.all([
      api.get("/expenses"),
      api.get("/suppliers")
    ]);
    setExpenses(expensesRes.data);
    setSuppliers(suppliersRes.data);
  }

  useEffect(() => {
    let active = true;
    loadData()
      .catch(() => toast.error("Impossible de charger les dépenses."))
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
    setActiveExpenseId(null);
    setForm(initialExpenseForm);
    setModalOpen(true);
  }

  async function openEditModal(expenseId) {
    try {
      const { data } = await api.get(`/expenses/${expenseId}`);
      setActiveExpenseId(expenseId);
      setForm(normalizeExpenseForForm(data));
      setModalOpen(true);
    } catch (error) {
      toast.error("Impossible de charger la dépense.");
    }
  }

  function closeModal() {
    setModalOpen(false);
    setActiveExpenseId(null);
    setForm(initialExpenseForm);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!form.category.trim()) {
      toast.error("Catégorie requise.");
      return;
    }

    const payload = {
      supplierId: form.supplierId ? Number(form.supplierId) : null,
      status: form.status,
      expenseDate: form.expenseDate || null,
      category: form.category,
      paymentMethod: form.paymentMethod || null,
      amount: Number(form.amount),
      taxRate: Number(form.taxRate),
      notes: form.notes || null,
      receiptUrl: form.receiptUrl || null
    };

    setSaving(true);
    try {
      if (isEditing) {
        await api.put(`/expenses/${activeExpenseId}`, payload);
        toast.success("Dépense mise à jour.");
      } else {
        await api.post("/expenses", payload);
        toast.success("Dépense créée.");
      }
      await loadData();
      closeModal();
    } catch (error) {
      toast.error(error.response?.data?.message || "Action impossible.");
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(expenseId, nextStatus) {
    try {
      const { data } = await api.patch(`/expenses/${expenseId}/status`, {
        status: nextStatus
      });
      setExpenses((prev) =>
        prev.map((expense) =>
          expense.id === expenseId
            ? {
                ...expense,
                status: data.status
              }
            : expense
        )
      );
      toast.success("Statut mis à jour.");
    } catch (error) {
      toast.error(error.response?.data?.message || "Mise a jour impossible.");
    }
  }

  async function handleDelete(expenseId) {
    if (!isAdmin) {
      toast.error("Seuls les admins peuvent supprimer.");
      return;
    }
    if (!window.confirm("Supprimer cette dépense ?")) {
      return;
    }

    try {
      await api.delete(`/expenses/${expenseId}`);
      setExpenses((prev) => prev.filter((expense) => expense.id !== expenseId));
      toast.success("Dépense supprimée.");
    } catch (error) {
      toast.error(error.response?.data?.message || "Suppression impossible.");
    }
  }

  async function handleReceiptUpload(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setUploadingReceipt(true);
    try {
      const uploaded = await uploadFile(file, "receipt");
      setForm((prev) => ({ ...prev, receiptUrl: uploaded.url }));
      toast.success("Justificatif uploadé.");
    } catch (error) {
      toast.error(error.response?.data?.message || "Upload impossible.");
    } finally {
      setUploadingReceipt(false);
      event.target.value = "";
    }
  }

  return (
    <div className="space-y-5">
      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-xl font-semibold text-slate-900">Dépenses</h2>
            <p className="text-sm text-slate-500">
              Contrôle des coûts opérationnels, catégories et justificatifs.
            </p>
          </div>
          <button type="button" onClick={openCreateModal} className="btn-primary">
            Nouvelle dépense
          </button>
        </div>
      </section>

      <section className="card overflow-hidden">
        {loading ? (
          <p className="text-sm text-slate-500">Chargement des dépenses...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-3">Dépense</th>
                  <th className="pb-3">Catégorie</th>
                  <th className="pb-3">Fournisseur</th>
                  <th className="pb-3">Statut</th>
                  <th className="pb-3 text-right">Total</th>
                  <th className="pb-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((expense) => (
                  <tr key={expense.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-3">
                      <p className="font-semibold text-slate-900">{expense.expenseNumber}</p>
                      <p className="text-xs text-slate-500">{formatDate(expense.expenseDate)}</p>
                    </td>
                    <td className="py-3 text-slate-700">{expense.category}</td>
                    <td className="py-3 text-slate-700">
                      {expense.supplier?.name || "Sans fournisseur"}
                    </td>
                    <td className="py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={expense.status} />
                        <select
                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600"
                          value={expense.status}
                          onChange={(event) => handleStatusChange(expense.id, event.target.value)}
                        >
                          {expenseStatusOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="py-3 text-right font-semibold text-slate-900">
                      {formatCurrency(expense.total)}
                    </td>
                    <td className="py-3">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                          onClick={() => openEditModal(expense.id)}
                          title="Modifier"
                        >
                          <Pencil size={14} />
                        </button>
                        {isAdmin && (
                          <button
                            type="button"
                            className="rounded-lg border border-rose-200 p-2 text-rose-600 hover:bg-rose-50"
                            onClick={() => handleDelete(expense.id)}
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
        title={isEditing ? "Modifier une dépense" : "Créer une dépense"}
        onClose={closeModal}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="field-label">Catégorie</label>
              <input
                list="expense-categories"
                className="field-input"
                value={form.category}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    category: event.target.value
                  }))
                }
                required
              />
              <datalist id="expense-categories">
                {defaultCategories.map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="field-label">Fournisseur (optionnel)</label>
              <select
                className="field-input"
                value={form.supplierId}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    supplierId: event.target.value
                  }))
                }
              >
                <option value="">Aucun</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name} {supplier.company ? `(${supplier.company})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Date</label>
              <input
                type="date"
                className="field-input"
                value={form.expenseDate}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    expenseDate: event.target.value
                  }))
                }
              />
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
                {expenseStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Montant HT</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="field-input"
                value={form.amount}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    amount: Number(event.target.value || 0)
                  }))
                }
                required
              />
            </div>
            <div>
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
            <div>
              <label className="field-label">Justificatif URL</label>
              <div className="relative">
                <input
                  type="url"
                  className="field-input pr-10"
                  value={form.receiptUrl}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      receiptUrl: event.target.value
                    }))
                  }
                />
                <Link2
                  size={15}
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
              </div>
              <label className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">
                <Upload size={14} />
                {uploadingReceipt ? "Upload..." : "Uploader un fichier"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,application/pdf"
                  className="hidden"
                  onChange={handleReceiptUpload}
                  disabled={uploadingReceipt}
                />
              </label>
            </div>
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
            <span className="text-slate-600">Total TTC estimé: </span>
            <span className="font-heading text-xl font-semibold text-brand-500">
              {formatCurrency(Number(form.amount || 0) * (1 + Number(form.taxRate || 0)))}
            </span>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={closeModal}>
              Annuler
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Enregistrement..." : isEditing ? "Mettre à jour" : "Créer la dépense"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
