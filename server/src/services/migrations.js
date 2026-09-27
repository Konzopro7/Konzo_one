import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const migrationDirectory = new URL("../../sql/migrations/", import.meta.url);
const legacyFiles = new Set([
  "2026-04-19-erp-phase2.sql", "2026-04-25-saas-subscriptions-and-platform-admin.sql",
  "2026-06-15-cad-currency.sql", "2026-06-15-product-expansion.sql", "2026-06-15-chatbot-whatsapp.sql"
]);

export async function readMigrations() {
  const names = (await readdir(migrationDirectory)).filter(name => name.endsWith(".sql")).sort();
  return Promise.all(names.map(async name => {
    const sql = await readFile(new URL(name, migrationDirectory), "utf8");
    // Git can convert line endings on Windows; ignore only that representation difference.
    const checksum = createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex");
    return { name, sql, checksum, legacy: legacyFiles.has(name) };
  }));
}

export async function verifyExistingSchema(client) {
  const schema = await readFile(new URL("../../sql/schema.sql", import.meta.url), "utf8");
  const missing = [];
  for (const match of schema.matchAll(/CREATE TABLE IF NOT EXISTS (\w+) \(([\s\S]*?)\n\);/g)) {
    const table = match[1];
    const columns = match[2].split(/\r?\n/).map(line => line.trim().match(/^([a-z_]+)\s+(?:SERIAL|INTEGER|VARCHAR|TEXT|BOOLEAN|TIMESTAMP|DATE|NUMERIC|JSONB)\b/i)?.[1]).filter(Boolean);
    const result = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`, [table]
    );
    const actual = new Set(result.rows.map(row => row.column_name));
    for (const column of columns) if (!actual.has(column)) missing.push(`${table}.${column}`);
  }
  if (missing.length) throw new Error(`Existing schema is incomplete; no baseline recorded: ${missing.join(", ")}`);
}

export async function runMigrations(client, { baseline = false, dryRun = false } = {}) {
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(19472026, 1)");
    const tracker = await client.query("SELECT to_regclass('schema_migrations') AS name");
    if (!tracker.rows[0].name && !baseline) {
      throw new Error("No migration baseline. Back up the database, then run migrate:baseline for an existing verified schema.");
    }
    if (baseline) await verifyExistingSchema(client);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY, checksum TEXT NOT NULL, baselined BOOLEAN NOT NULL DEFAULT FALSE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    const applied = await client.query("SELECT name, checksum FROM schema_migrations");
    const known = new Map(applied.rows.map(row => [row.name, row.checksum]));
    const files = await readMigrations();
    const present = new Set(files.map(file => file.name));
    for (const name of known.keys()) if (!present.has(name)) throw new Error(`Applied migration is missing: ${name}`);
    const changes = [];
    for (const file of files) {
      if (known.has(file.name)) {
        if (known.get(file.name) !== file.checksum) throw new Error(`Applied migration was modified: ${file.name}`);
        continue;
      }
      if (baseline && !file.legacy) continue;
      if (!baseline && file.legacy) throw new Error(`Legacy migration has not been baselined: ${file.name}`);
      if (!baseline) await client.query(file.sql);
      await client.query("INSERT INTO schema_migrations(name, checksum, baselined) VALUES ($1, $2, $3)", [file.name, file.checksum, baseline]);
      changes.push({ name: file.name, action: baseline ? "baseline" : "apply" });
    }
    await client.query(dryRun ? "ROLLBACK" : "COMMIT");
    return { dryRun, changes };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
