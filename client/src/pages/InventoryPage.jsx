import { useEffect, useMemo, useState } from "react";
import { ArrowUpDown, Pencil, Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import api from "../lib/api.js";
import { formatCurrency, formatDate } from "../lib/format.js";
import Modal from "../components/Modal.jsx";
import { useAuth } from "../hooks/useAuth.jsx";

const initialItemForm = {
  sku: "",
  name: "",
  category: "",
  unit: "unite",
  costPrice: 0,
  salePrice: 0,
  stockQuantity: 0,
  minStockAlert: 0,
  notes: ""
};

const initialAdjustmentForm = {
  direction: "in",
  quantity: 1,
  reason: "",
  unitCost: ""
};

function normalizeItemForForm(item) {
  return {
    sku: item.sku || "",
    name: item.name || "",
    category: item.category || "",
    unit: item.unit || "unite",
    costPrice: Number(item.costPrice || 0),
    salePrice: Number(item.salePrice || 0),
    stockQuantity: Number(item.stockQuantity || 0),
    minStockAlert: Number(item.minStockAlert || 0),
    notes: item.notes || ""
  };
}

export default function InventoryPage() {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState([]);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [activeItemId, setActiveItemId] = useState(null);
  const [adjustItem, setAdjustItem] = useState(null);
  const [itemForm, setItemForm] = useState(initialItemForm);
  const [adjustForm, setAdjustForm] = useState(initialAdjustmentForm);

  const isEditing = Boolean(activeItemId);

  const summary = useMemo(() => {
    const lowStockCount = items.filter(
      (item) => Number(item.stockQuantity) <= Number(item.minStockAlert)
    ).length;

    const totalStockValue = items.reduce(
      (sum, item) => sum + Number(item.stockQuantity || 0) * Number(item.costPrice || 0),
      0
    );

    const totalPotentialSales = items.reduce(
      (sum, item) => sum + Number(item.stockQuantity || 0) * Number(item.salePrice || 0),
      0
    );

    return {
      itemsCount: items.length,
      lowStockCount,
      totalStockValue,
      totalPotentialSales
    };
  }, [items]);

  async function loadData() {
    const [itemsRes, movementsRes] = await Promise.all([
      api.get("/inventory"),
      api.get("/inventory/movements", {
        params: { limit: 80 }
      })
    ]);
    setItems(itemsRes.data);
    setMovements(movementsRes.data);
  }

  useEffect(() => {
    let active = true;
    loadData()
      .catch(() => toast.error("Impossible de charger l'inventaire."))
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
    setActiveItemId(null);
    setItemForm(initialItemForm);
    setItemModalOpen(true);
  }

  async function openEditModal(itemId) {
    try {
      const { data } = await api.get(`/inventory/${itemId}`);
      setActiveItemId(itemId);
      setItemForm(normalizeItemForForm(data));
      setItemModalOpen(true);
    } catch (error) {
      toast.error("Impossible de charger l'article.");
    }
  }

  function closeItemModal() {
    setItemModalOpen(false);
    setActiveItemId(null);
    setItemForm(initialItemForm);
  }

  function openAdjustModal(item) {
    setAdjustItem(item);
    setAdjustForm({
      direction: "in",
      quantity: 1,
      reason: "",
      unitCost: Number(item.costPrice || 0)
    });
    setAdjustModalOpen(true);
  }

  function closeAdjustModal() {
    setAdjustModalOpen(false);
    setAdjustItem(null);
    setAdjustForm(initialAdjustmentForm);
  }

  async function handleSubmitItem(event) {
    event.preventDefault();

    const payload = {
      ...itemForm,
      sku: itemForm.sku.trim(),
      name: itemForm.name.trim(),
      category: itemForm.category || null,
      unit: itemForm.unit || "unite",
      notes: itemForm.notes || null,
      costPrice: Number(itemForm.costPrice || 0),
      salePrice: Number(itemForm.salePrice || 0),
      stockQuantity: Number(itemForm.stockQuantity || 0),
      minStockAlert: Number(itemForm.minStockAlert || 0)
    };

    if (!payload.sku || !payload.name) {
      toast.error("SKU et nom article sont requis.");
      return;
    }

    setSaving(true);
    try {
      if (isEditing) {
        await api.put(`/inventory/${activeItemId}`, payload);
        toast.success("Article mis à jour.");
      } else {
        await api.post("/inventory", payload);
      toast.success("Article créé.");
      }
      await loadData();
      closeItemModal();
    } catch (error) {
      toast.error(error.response?.data?.message || "Action impossible.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteItem(itemId) {
    if (!isAdmin) {
      toast.error("Seuls les admins peuvent supprimer.");
      return;
    }
    if (!window.confirm("Supprimer cet article et son historique de stock ?")) {
      return;
    }
    try {
      await api.delete(`/inventory/${itemId}`);
      setItems((prev) => prev.filter((item) => item.id !== itemId));
      setMovements((prev) => prev.filter((movement) => movement.inventoryItemId !== itemId));
      toast.success("Article supprimé.");
    } catch (error) {
      toast.error(error.response?.data?.message || "Suppression impossible.");
    }
  }

  async function handleAdjustStock(event) {
    event.preventDefault();
    if (!adjustItem) {
      return;
    }

    setAdjusting(true);
    try {
      await api.patch(`/inventory/${adjustItem.id}/stock`, {
        direction: adjustForm.direction,
        quantity: Number(adjustForm.quantity || 0),
        reason: adjustForm.reason || null,
        unitCost:
          adjustForm.unitCost === "" || adjustForm.unitCost === null
            ? null
            : Number(adjustForm.unitCost)
      });
      toast.success("Stock mis à jour.");
      await loadData();
      closeAdjustModal();
    } catch (error) {
      toast.error(error.response?.data?.message || "Ajustement impossible.");
    } finally {
      setAdjusting(false);
    }
  }

  if (loading) {
    return (
      <section className="card">
        <p className="text-sm text-slate-500">Chargement du stock...</p>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="card">
          <p className="text-sm text-slate-500">Articles actifs</p>
          <p className="mt-2 font-heading text-2xl font-semibold text-slate-900">
            {summary.itemsCount}
          </p>
        </article>
        <article className="card">
          <p className="text-sm text-slate-500">Stock faible</p>
          <p
            className={[
              "mt-2 font-heading text-2xl font-semibold",
              summary.lowStockCount > 0 ? "text-amber-700" : "text-emerald-700"
            ].join(" ")}
          >
            {summary.lowStockCount}
          </p>
        </article>
        <article className="card">
          <p className="text-sm text-slate-500">Valeur de stock (coût)</p>
          <p className="mt-2 font-heading text-2xl font-semibold text-slate-900">
            {formatCurrency(summary.totalStockValue)}
          </p>
        </article>
        <article className="card">
          <p className="text-sm text-slate-500">Potentiel vente</p>
          <p className="mt-2 font-heading text-2xl font-semibold text-brand-600">
            {formatCurrency(summary.totalPotentialSales)}
          </p>
        </article>
      </section>

      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-xl font-semibold text-slate-900">Stock et inventaire</h2>
            <p className="text-sm text-slate-500">
              Gestion des articles ERP, seuils d'alerte et mouvements de stock.
            </p>
          </div>
          <button type="button" onClick={openCreateModal} className="btn-primary gap-2">
            <Plus size={14} />
            Nouvel article
          </button>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-3">Article</th>
                <th className="pb-3">Catégorie</th>
                <th className="pb-3">Stock</th>
                <th className="pb-3">Seuil</th>
                <th className="pb-3">Coût unit.</th>
                <th className="pb-3 text-right">Valeur stock</th>
                <th className="pb-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const isLowStock = Number(item.stockQuantity) <= Number(item.minStockAlert);
                const stockValue = Number(item.stockQuantity || 0) * Number(item.costPrice || 0);

                return (
                  <tr key={item.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-3">
                      <p className="font-semibold text-slate-900">{item.name}</p>
                      <p className="text-xs text-slate-500">
                        {item.sku} • {item.unit || "unité"}
                      </p>
                    </td>
                    <td className="py-3 text-slate-700">{item.category || "Non classé"}</td>
                    <td className="py-3">
                      <span
                        className={[
                          "rounded-full px-2.5 py-1 text-xs font-semibold",
                          isLowStock
                            ? "bg-amber-100 text-amber-800"
                            : "bg-emerald-100 text-emerald-800"
                        ].join(" ")}
                      >
                        {item.stockQuantity}
                      </span>
                    </td>
                    <td className="py-3 text-slate-700">{item.minStockAlert}</td>
                    <td className="py-3 text-slate-700">{formatCurrency(item.costPrice)}</td>
                    <td className="py-3 text-right font-semibold text-slate-900">
                      {formatCurrency(stockValue)}
                    </td>
                    <td className="py-3">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                          onClick={() => openAdjustModal(item)}
                          title="Ajuster stock"
                        >
                          <ArrowUpDown size={14} />
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                          onClick={() => openEditModal(item.id)}
                          title="Modifier"
                        >
                          <Pencil size={14} />
                        </button>
                        {isAdmin && (
                          <button
                            type="button"
                            className="rounded-lg border border-rose-200 p-2 text-rose-600 hover:bg-rose-50"
                            onClick={() => handleDeleteItem(item.id)}
                            title="Supprimer"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {items.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            Aucun article stocké pour le moment.
          </div>
        )}
      </section>

      <section className="card overflow-hidden">
        <h2 className="mb-4 font-heading text-lg font-semibold text-slate-900">Derniers mouvements</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-3">Date</th>
                <th className="pb-3">Article</th>
                <th className="pb-3">Type</th>
                <th className="pb-3">Quantité</th>
                <th className="pb-3">Coût unit.</th>
                <th className="pb-3">Motif</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((movement) => (
                <tr key={movement.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-3 text-slate-700">{formatDate(movement.createdAt)}</td>
                  <td className="py-3">
                    <p className="font-semibold text-slate-900">{movement.item.name}</p>
                    <p className="text-xs text-slate-500">{movement.item.sku}</p>
                  </td>
                  <td className="py-3">
                    <span
                      className={[
                        "rounded-full px-2.5 py-1 text-xs font-semibold",
                        movement.movementType === "out"
                          ? "bg-rose-100 text-rose-700"
                          : movement.movementType === "in"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-700"
                      ].join(" ")}
                    >
                      {movement.movementType}
                    </span>
                  </td>
                  <td
                    className={[
                      "py-3 font-semibold",
                      movement.movementType === "out" ? "text-rose-700" : "text-emerald-700"
                    ].join(" ")}
                  >
                    {movement.movementType === "out" ? "-" : "+"} {Math.abs(movement.quantity)}
                  </td>
                  <td className="py-3 text-slate-700">
                    {movement.unitCost === null ? "-" : formatCurrency(movement.unitCost)}
                  </td>
                  <td className="py-3 text-slate-700">{movement.reason || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {movements.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            Aucun mouvement de stock.
          </div>
        )}
      </section>

      <Modal
        isOpen={itemModalOpen}
        title={isEditing ? "Modifier un article" : "Créer un article"}
        onClose={closeItemModal}
      >
        <form onSubmit={handleSubmitItem} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="field-label">SKU</label>
              <input
                className="field-input"
                value={itemForm.sku}
                onChange={(event) =>
                  setItemForm((prev) => ({
                    ...prev,
                    sku: event.target.value
                  }))
                }
                required
              />
            </div>
            <div>
              <label className="field-label">Nom article</label>
              <input
                className="field-input"
                value={itemForm.name}
                onChange={(event) =>
                  setItemForm((prev) => ({
                    ...prev,
                    name: event.target.value
                  }))
                }
                required
              />
            </div>
            <div>
              <label className="field-label">Catégorie</label>
              <input
                className="field-input"
                value={itemForm.category}
                onChange={(event) =>
                  setItemForm((prev) => ({
                    ...prev,
                    category: event.target.value
                  }))
                }
              />
            </div>
            <div>
              <label className="field-label">Unité</label>
              <input
                className="field-input"
                value={itemForm.unit}
                onChange={(event) =>
                  setItemForm((prev) => ({
                    ...prev,
                    unit: event.target.value
                  }))
                }
              />
            </div>
            <div>
              <label className="field-label">Coût unitaire</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="field-input"
                value={itemForm.costPrice}
                onChange={(event) =>
                  setItemForm((prev) => ({
                    ...prev,
                    costPrice: Number(event.target.value || 0)
                  }))
                }
              />
            </div>
            <div>
              <label className="field-label">Prix de vente</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="field-input"
                value={itemForm.salePrice}
                onChange={(event) =>
                  setItemForm((prev) => ({
                    ...prev,
                    salePrice: Number(event.target.value || 0)
                  }))
                }
              />
            </div>
            <div>
              <label className="field-label">Stock actuel</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="field-input"
                value={itemForm.stockQuantity}
                onChange={(event) =>
                  setItemForm((prev) => ({
                    ...prev,
                    stockQuantity: Number(event.target.value || 0)
                  }))
                }
              />
            </div>
            <div>
              <label className="field-label">Seuil alerte</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="field-input"
                value={itemForm.minStockAlert}
                onChange={(event) =>
                  setItemForm((prev) => ({
                    ...prev,
                    minStockAlert: Number(event.target.value || 0)
                  }))
                }
              />
            </div>
          </div>

          <div>
            <label className="field-label">Notes</label>
            <textarea
              rows={3}
              className="field-textarea"
              value={itemForm.notes}
              onChange={(event) =>
                setItemForm((prev) => ({
                  ...prev,
                  notes: event.target.value
                }))
              }
            />
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={closeItemModal}>
              Annuler
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Enregistrement..." : isEditing ? "Mettre à jour" : "Créer"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={adjustModalOpen}
        title={`Ajuster stock${adjustItem ? ` - ${adjustItem.name}` : ""}`}
        onClose={closeAdjustModal}
      >
        <form onSubmit={handleAdjustStock} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="field-label">Direction</label>
              <select
                className="field-input"
                value={adjustForm.direction}
                onChange={(event) =>
                  setAdjustForm((prev) => ({
                    ...prev,
                    direction: event.target.value
                  }))
                }
              >
                <option value="in">Entrée</option>
                <option value="out">Sortie</option>
              </select>
            </div>
            <div>
              <label className="field-label">Quantité</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                className="field-input"
                value={adjustForm.quantity}
                onChange={(event) =>
                  setAdjustForm((prev) => ({
                    ...prev,
                    quantity: Number(event.target.value || 0)
                  }))
                }
                required
              />
            </div>
            <div>
              <label className="field-label">Coût unitaire (optionnel)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="field-input"
                value={adjustForm.unitCost}
                onChange={(event) =>
                  setAdjustForm((prev) => ({
                    ...prev,
                    unitCost: event.target.value
                  }))
                }
              />
            </div>
            <div>
              <label className="field-label">Motif</label>
              <input
                className="field-input"
                placeholder="Réception fournisseur, correction, etc."
                value={adjustForm.reason}
                onChange={(event) =>
                  setAdjustForm((prev) => ({
                    ...prev,
                    reason: event.target.value
                  }))
                }
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={closeAdjustModal}>
              Annuler
            </button>
            <button type="submit" className="btn-primary" disabled={adjusting}>
              {adjusting ? "Mise à jour..." : "Appliquer"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
