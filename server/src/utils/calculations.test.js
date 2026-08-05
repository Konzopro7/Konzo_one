import test from "node:test";
import assert from "node:assert/strict";
import { computeTotals, normalizeItems } from "./calculations.js";

test("normalizeItems trims valid items and drops empty or zero-quantity lines", () => {
  assert.deepEqual(
    normalizeItems([
      { description: "  Design  ", unitPrice: "100", quantity: "2" },
      { description: "", unitPrice: 50, quantity: 1 },
      { description: "Ignored", unitPrice: 50, quantity: 0 }
    ]),
    [{ description: "Design", unitPrice: 100, quantity: 2 }]
  );
});

test("computeTotals returns line totals, subtotal, tax amount, and total", () => {
  assert.deepEqual(
    computeTotals(
      [
        { description: "Design", unitPrice: 100, quantity: 2 },
        { description: "Hosting", unitPrice: 19.99, quantity: 1 }
      ],
      0.2
    ),
    {
      items: [
        { description: "Design", unitPrice: 100, quantity: 2, lineTotal: 200 },
        { description: "Hosting", unitPrice: 19.99, quantity: 1, lineTotal: 19.99 }
      ],
      subtotal: 219.99,
      taxRate: 0.2,
      taxAmount: 44,
      total: 263.99
    }
  );
});
