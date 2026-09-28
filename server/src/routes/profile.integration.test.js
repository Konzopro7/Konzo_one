import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { readFile } from "node:fs/promises";
import pool from "../db.js";
import router from "./auth.js";

test("PostgreSQL: personal profile migration preserves users and scopes updates", { skip: !process.env.TEST_DATABASE_URL }, async t => {
  const db = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL, connectionTimeoutMillis: 3000 });
  await db.connect();
  try {
    await db.query("BEGIN");
    await db.query(`CREATE TEMP TABLE users (id INT, agency_id INT, full_name TEXT, email TEXT, role TEXT);
      INSERT INTO users VALUES (1,10,'Alice','alice@example.invalid','readonly'),(2,20,'Bob','bob@example.invalid','admin');`);
    await db.query(await readFile(new URL("../../sql/migrations/2026-09-27-user-avatar.sql", import.meta.url), "utf8"));
    assert.ok((await db.query("SELECT avatar_url FROM users")).rows.every(row => row.avatar_url === null));
    t.mock.method(pool, "query", (sql, params) => db.query(sql, params));
    const handler = router.stack.find(layer => layer.route?.path === "/profile").route.stack.at(-1).handle;
    const res = { status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await handler({ user: { id: 1, agencyId: 20 }, body: { fullName: "Changed", avatarUrl: null } }, res, error => { throw error; });
    assert.equal(res.statusCode, 404);
    await handler({ user: { id: 1, agencyId: 10 }, body: { fullName: "Alice Martin", avatarUrl: null, role: "admin" } }, res, error => { throw error; });
    assert.deepEqual((await db.query("SELECT full_name, role FROM users ORDER BY id")).rows, [{ full_name: "Alice Martin", role: "readonly" }, { full_name: "Bob", role: "admin" }]);
  } finally { await db.query("ROLLBACK"); await db.end(); }
});
