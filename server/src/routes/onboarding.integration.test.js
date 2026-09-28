import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { readFile } from "node:fs/promises";
import pool from "../db.js";
import router from "./auth.js";

test("PostgreSQL: welcome migration preserves existing users and guides new accounts across sessions", { skip: !process.env.TEST_DATABASE_URL }, async t => {
  const db = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL, connectionTimeoutMillis: 3000 });
  await db.connect();
  try {
    await db.query("BEGIN");
    await db.query(`CREATE TEMP TABLE users (id SERIAL PRIMARY KEY, agency_id INT, full_name TEXT);
      INSERT INTO users (agency_id, full_name) VALUES (10, 'Existing user');`);
    const migration = await readFile(new URL("../../sql/migrations/2026-09-27-welcome-guide.sql", import.meta.url), "utf8");
    await db.query(migration);
    await db.query("INSERT INTO users (agency_id, full_name) VALUES (10, 'New user'), (20, 'Other agency')");
    assert.deepEqual((await db.query("SELECT onboarding_status FROM users ORDER BY id")).rows.map(row => row.onboarding_status), ["existing", "pending", "pending"]);
    t.mock.method(pool, "query", (sql, params) => db.query(sql, params));
    const handler = router.stack.find(layer => layer.route?.path === "/onboarding").route.stack.at(-1).handle;
    const res = { status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await handler({ user: { id: 2, agencyId: 20 } }, res, error => { throw error; });
    assert.equal(res.statusCode, 404);
    await handler({ user: { id: 2, agencyId: 10 } }, res, error => { throw error; });
    assert.deepEqual((await db.query("SELECT onboarding_status FROM users ORDER BY id")).rows.map(row => row.onboarding_status), ["existing", "seen", "pending"]);
    await assert.rejects(db.query("UPDATE users SET onboarding_status = 'invalid' WHERE id = 2"), { code: "23514" });
  } finally {
    await db.query("ROLLBACK");
    await db.end();
  }
});
