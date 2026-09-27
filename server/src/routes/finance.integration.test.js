import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import pool from "../db.js";
import clients from "./clients.js";
import ledger from "./ledger.js";
import { readFile } from "node:fs/promises";

// Opt-in only. Fixtures are TEMP tables and the transaction is always rolled back.
test("PostgreSQL: client totals and filtered ledger remain tenant scoped", { skip: !process.env.TEST_DATABASE_URL }, async t => {
  const db = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL, connectionTimeoutMillis: 3000 });
  await db.connect();
  try {
    await db.query("BEGIN");
    await db.query(`
      CREATE TEMP TABLE clients (id INT, agency_id INT, name TEXT, company TEXT, email TEXT, phone TEXT, created_at TIMESTAMP, updated_at TIMESTAMP);
      CREATE TEMP TABLE quotes (id INT, agency_id INT, client_id INT);
      CREATE TEMP TABLE invoices (id INT, agency_id INT, client_id INT, total NUMERIC, status TEXT, issue_date DATE, invoice_number TEXT);
      CREATE TEMP TABLE suppliers (id INT, name TEXT);
      CREATE TEMP TABLE purchases (id INT, agency_id INT, supplier_id INT, total NUMERIC, status TEXT, issue_date DATE, due_date DATE, purchase_number TEXT);
      CREATE TEMP TABLE expenses (id INT, agency_id INT, supplier_id INT, total NUMERIC, status TEXT, expense_date DATE, expense_number TEXT, category TEXT);
      INSERT INTO clients VALUES (1,10,'Client A',NULL,NULL,NULL,NOW(),NOW()), (2,20,'Client B',NULL,NULL,NULL,NOW(),NOW());
      INSERT INTO quotes VALUES (1,10,1),(2,10,1),(3,20,2);
      INSERT INTO invoices VALUES (1,10,1,100,'paid','2026-09-05','FAC-2026-0001'),(2,20,2,999,'paid','2026-09-05','FAC-2026-0002');
    `);
    t.mock.method(pool, "query", (sql, params) => db.query(sql, params));
    async function get(router, path, query = {}) {
      const handler = router.stack.find(layer => layer.route?.path === path && layer.route.methods.get).route.stack.at(-1).handle;
      let body;
      await handler({ user: { agencyId: 10 }, query }, { json(value) { body = value; } }, error => { throw error; });
      return body;
    }
    const list = await get(clients, "/");
    assert.equal(list.length, 1);
    assert.equal(list[0].quotesCount, 2);
    assert.equal(list[0].invoicesCount, 1);
    assert.equal(list[0].paidTotal, 100);
    const filtered = await get(ledger, "/entries", { from: "2026-09-01", to: "2026-09-30", type: "invoice" });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].amount, 100);
    assert.deepEqual(await get(ledger, "/entries", { from: "2026-10-01" }), []);

    const migration = await readFile(new URL("../../sql/migrations/2026-09-22-contact-details.sql", import.meta.url), "utf8");
    await db.query(migration);
    await db.query(migration);
    const update = clients.stack.find(layer => layer.route?.path === "/:id" && layer.route.methods.put).route.stack.at(-1).handle;
    async function put(id, body) {
      const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
      await update({ user: { agencyId: 10 }, params: { id: String(id) }, body }, res, error => { throw error; });
      return res;
    }
    const legacy = { name: "Client A", email: "a@example.test", company: "Entreprise A", phone: "514-555-0100" };
    const enriched = await put(1, { ...legacy, firstName: "Camille", city: "Montréal", preferredLanguage: "fr-CA", tags: ["PME", "PME"], notes: "Historique à conserver" });
    assert.equal(enriched.body.city, "Montréal");
    assert.deepEqual(enriched.body.tags, ["PME"]);
    const olderConsumer = await put(1, { ...legacy, phone: "514-555-0101" });
    assert.equal(olderConsumer.body.notes, "Historique à conserver");
    assert.equal(olderConsumer.body.city, "Montréal");
    assert.equal((await put(2, { ...legacy, notes: "Forbidden" })).statusCode, 404);
    assert.equal((await put(1, { ...legacy, preferredLanguage: "unknown" })).statusCode, 400);
    assert.equal((await db.query("SELECT COUNT(*)::INT AS count FROM clients")).rows[0].count, 2);
  } finally {
    await db.query("ROLLBACK");
    await db.end();
  }
});
