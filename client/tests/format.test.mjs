import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { formatDate, toInputDate } from "../src/lib/format.js";
import { computeTotals } from "../../shared/documentTotals.mjs";
import { documentFormError, apiErrorMessage } from "../src/lib/formErrors.js";

test("Civil document dates remain the same day in Canada and Pacific time zones", () => {
  const moduleUrl = new URL("../../shared/dates.mjs", import.meta.url).href;
  for (const tz of [
    "America/Toronto",
    "America/Vancouver",
    "Pacific/Auckland",
  ]) {
    const actual = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import {displayDate} from ${JSON.stringify(moduleUrl)}; const date=displayDate('2026-09-28'); console.log(date.getDate());`,
      ],
      { env: { ...process.env, TZ: tz }, encoding: "utf8" },
    ).trim();
    assert.equal(actual, "28");
  }
  assert.equal(toInputDate("2026-09-28"), "2026-09-28");
  assert.equal(toInputDate("invalid"), "");
  assert.equal(formatDate("2026-02-30"), "-");
  assert.equal(toInputDate("2024-02-29"), "2024-02-29");
});

test("Document preview matches API rounding for fractional prices and tax", () => {
  const totals = computeTotals(
    [{ description: "Service", unitPrice: 0.67, quantity: 1.5 }],
    0.15,
  );
  assert.equal(totals.subtotal, 1.01);
  assert.equal(totals.taxAmount, 0.15);
  assert.equal(totals.total, 1.16);
  assert.equal(
    documentFormError({
      clientId: 1,
      taxRate: 0.15,
      items: [{ description: "Service", unitPrice: 5, quantity: 0.5 }],
    }),
    null,
  );
  assert.match(
    documentFormError({
      clientId: 1,
      taxRate: 0.15,
      items: [{ description: " ", unitPrice: 5, quantity: 1 }],
    }),
    /description/,
  );
  assert.equal(
    apiErrorMessage({
      response: {
        data: {
          message: "Validation failed.",
          issues: { fieldErrors: { email: ["Email invalide."] } },
        },
      },
    }),
    "Email invalide.",
  );
});
