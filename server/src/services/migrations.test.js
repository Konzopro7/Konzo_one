import test from "node:test";
import assert from "node:assert/strict";
import { readMigrations, runMigrations } from "./migrations.js";

test("migration runner refuses an untracked existing database without an explicit baseline", async () => {
  const statements = [];
  const client = { async query(sql) {
    statements.push(sql);
    if (sql.includes("to_regclass")) return { rows: [{ name: null }] };
    return { rows: [] };
  } };
  await assert.rejects(runMigrations(client), /No migration baseline/);
  assert.equal(statements.at(-1), "ROLLBACK");
  assert.ok(!statements.some(sql => sql.includes("CREATE TABLE")));
});

test("migration runner refuses modified applied migrations and rolls back", async () => {
  const files = await readMigrations();
  const statements = [];
  const client = { async query(sql) {
    statements.push(sql);
    if (sql.includes("to_regclass")) return { rows: [{ name: "schema_migrations" }] };
    if (sql === "SELECT name, checksum FROM schema_migrations") return { rows: [{ name: files[0].name, checksum: "invalid" }] };
    return { rows: [] };
  } };
  await assert.rejects(runMigrations(client), /was modified/);
  assert.equal(statements.at(-1), "ROLLBACK");
  assert.ok(!statements.includes("COMMIT"));
});

test("migration dry-run applies only pending changes and ends with rollback", async () => {
  const files = await readMigrations();
  const statements = [];
  const client = { async query(sql) {
    statements.push(sql);
    if (sql.includes("to_regclass")) return { rows: [{ name: "schema_migrations" }] };
    if (sql === "SELECT name, checksum FROM schema_migrations") return { rows: files.filter(file => file.legacy) };
    return { rows: [] };
  } };
  const result = await runMigrations(client, { dryRun: true });
  assert.deepEqual(result.changes.map(change => change.name), files.filter(file => !file.legacy).map(file => file.name));
  assert.equal(statements.at(-1), "ROLLBACK");
  for (const file of files.filter(file => file.legacy)) assert.ok(!statements.includes(file.sql));
});
