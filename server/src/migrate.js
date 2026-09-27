import pool from "./db.js";
import { runMigrations } from "./services/migrations.js";

let connection;
try {
  connection = await pool.connect();
  console.log(JSON.stringify(await runMigrations(connection, {
    baseline: process.argv.includes("--baseline-existing"),
    dryRun: process.argv.includes("--dry-run")
  }), null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  connection?.release();
  await pool.end();
}
