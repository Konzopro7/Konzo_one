export { computeTotals } from "../../../shared/documentTotals.mjs";

export function normalizeItems(items = []) {
  return items
    .map((item) => {
      const description = String(item.description || "").trim();
      const unitPrice = Number(item.unitPrice || 0);
      const quantity = Number(item.quantity || 0);
      return {
        description,
        unitPrice,
        quantity,
      };
    })
    .filter((item) => item.description && item.quantity > 0);
}
