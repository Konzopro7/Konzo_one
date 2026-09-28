const round2 = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export function hasDecimalPrecision(value, decimals) {
  const scaled = Number(value) * 10 ** decimals;
  return (
    Number.isFinite(scaled) && Math.abs(scaled - Math.round(scaled)) < 0.00001
  );
}

// Shared preview/API calculation; preserve the existing document rounding rules.
export function computeTotals(items = [], taxRate = 0.2) {
  const cleanTaxRate = Number.isFinite(Number(taxRate)) ? Number(taxRate) : 0;
  const subtotal = round2(
    items.reduce(
      (acc, item) =>
        acc + Number(item.unitPrice || 0) * Number(item.quantity || 0),
      0,
    ),
  );
  const taxAmount = round2(subtotal * cleanTaxRate);
  return {
    items: items.map((item) => ({
      ...item,
      lineTotal: round2(
        Number(item.unitPrice || 0) * Number(item.quantity || 0),
      ),
    })),
    subtotal,
    taxRate: cleanTaxRate,
    taxAmount,
    total: round2(subtotal + taxAmount),
  };
}
