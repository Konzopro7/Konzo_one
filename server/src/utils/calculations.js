const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export function normalizeItems(items = []) {
  return items
    .map((item) => {
      const description = String(item.description || "").trim();
      const unitPrice = Number(item.unitPrice || 0);
      const quantity = Number(item.quantity || 0);
      return {
        description,
        unitPrice,
        quantity
      };
    })
    .filter((item) => item.description && item.quantity > 0);
}

export function computeTotals(items = [], taxRate = 0.2) {
  const cleanTaxRate = Number.isFinite(Number(taxRate)) ? Number(taxRate) : 0;
  const subtotal = round2(
    items.reduce((acc, item) => acc + Number(item.unitPrice) * Number(item.quantity), 0)
  );
  const taxAmount = round2(subtotal * cleanTaxRate);
  const total = round2(subtotal + taxAmount);

  const withLineTotals = items.map((item) => ({
    ...item,
    lineTotal: round2(Number(item.unitPrice) * Number(item.quantity))
  }));

  return {
    items: withLineTotals,
    subtotal,
    taxRate: cleanTaxRate,
    taxAmount,
    total
  };
}
