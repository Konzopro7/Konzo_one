import test from "node:test";
import assert from "node:assert/strict";
import { buildBusinessPdf } from "./pdf.js";

const fixture = {
  documentType: "invoice", data: { number: "FAC-TEST-0001", issueDate: "2026-09-27", dueDate: "2026-10-12", subtotal: 1445, taxAmount: 0, total: 1445, taxRate: 0, status: "pending" },
  settings: { agency_name: "Studio Nord", agency_email: "bonjour@example.invalid", payment_terms: "Paiement sous 15 jours." },
  client: { name: "Camille Martin", company: "Atelier Boréal", email: "camille@example.invalid" },
  items: [{ description: "Maintenance", quantity: 1, unitPrice: 45, lineTotal: 45 }, { description: "Conception web", quantity: 1, unitPrice: 1200, lineTotal: 1200 }, { description: "Analyse", quantity: 1, unitPrice: 200, lineTotal: 200 }]
};
const pages = buffer => (buffer.toString("latin1").match(/\/Type \/Page\b/g) || []).length;

test("a standard invoice or quote fits one page including the footer", async () => {
  for (const documentType of ["invoice", "quote", "purchase"]) {
    const buffer = await buildBusinessPdf({ ...fixture, documentType });
    assert.ok(buffer.subarray(0, 5).equals(Buffer.from("%PDF-")));
    assert.equal(pages(buffer), 1);
  }
});

test("long descriptions and notes paginate rather than overflowing or losing the document", async () => {
  const buffer = await buildBusinessPdf({ ...fixture, documentType: "quote", data: { ...fixture.data, notes: "Conditions détaillées et précisions. ".repeat(80) }, items: [{ ...fixture.items[0], description: "Description complète à conserver. ".repeat(200) }, ...Array.from({ length: 30 }, (_, i) => ({ ...fixture.items[1], description: `Prestation ${i + 1}` }))] });
  assert.ok(pages(buffer) >= 4);
  assert.ok(pages(buffer) < 12);
});

test("a remote or foreign logo does not trigger network access or prevent generation", async () => {
  const buffer = await buildBusinessPdf({ ...fixture, settings: { ...fixture.settings, agency_id: 10, logo_url: "https://example.invalid/logo.png" } });
  assert.equal(pages(buffer), 1);
});
