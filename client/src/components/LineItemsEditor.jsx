import { Plus, Trash2 } from "lucide-react";
import { formatCurrency } from "../lib/format.js";

export const emptyLineItem = {
  description: "",
  unitPrice: 0,
  quantity: 1
};

export function computeDraftTotals(items, taxRate = 0.2) {
  const subtotal = items.reduce(
    (sum, item) => sum + Number(item.unitPrice || 0) * Number(item.quantity || 0),
    0
  );
  const taxAmount = subtotal * Number(taxRate || 0);
  return {
    subtotal,
    taxAmount,
    total: subtotal + taxAmount
  };
}

export default function LineItemsEditor({ items, onChange, taxRate = 0.2 }) {
  const totals = computeDraftTotals(items, taxRate);

  function updateItem(index, field, value) {
    const next = [...items];
    next[index] = {
      ...next[index],
      [field]: value
    };
    onChange(next);
  }

  function addItem() {
    onChange([...items, { ...emptyLineItem }]);
  }

  function removeItem(index) {
    if (items.length === 1) {
      return;
    }
    onChange(items.filter((_, itemIndex) => itemIndex !== index));
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Service</th>
              <th className="px-3 py-2">Prix unitaire</th>
              <th className="px-3 py-2">Quantité</th>
              <th className="px-3 py-2 text-right">Ligne</th>
              <th className="px-3 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const lineTotal = Number(item.unitPrice || 0) * Number(item.quantity || 0);
              return (
                <tr key={`line-item-${index}`} className="border-t border-slate-200">
                  <td className="px-3 py-2">
                    <input
                      className="field-input"
                      placeholder="Ex: Conception site vitrine"
                      value={item.description}
                      onChange={(event) => updateItem(index, "description", event.target.value)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="field-input"
                      value={item.unitPrice}
                      onChange={(event) =>
                        updateItem(index, "unitPrice", Number(event.target.value || 0))
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      className="field-input"
                      value={item.quantity}
                      onChange={(event) =>
                        updateItem(index, "quantity", Number(event.target.value || 1))
                      }
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-slate-900">
                    {formatCurrency(lineTotal)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={addItem} className="btn-secondary gap-2">
          <Plus size={16} />
          Ajouter une ligne
        </button>

        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm">
          <p className="text-slate-600">Sous-total: <span className="font-semibold text-slate-900">{formatCurrency(totals.subtotal)}</span></p>
          <p className="text-slate-600">TVA: <span className="font-semibold text-slate-900">{formatCurrency(totals.taxAmount)}</span></p>
          <p className="text-slate-700">Total: <span className="font-heading text-lg font-semibold text-brand-500">{formatCurrency(totals.total)}</span></p>
        </div>
      </div>
    </div>
  );
}
