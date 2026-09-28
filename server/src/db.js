import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

// PostgreSQL DATE values are civil days; serializing local midnight loses a day
// for some client time zones. TIMESTAMP/TIMESTAMPTZ parsers remain unchanged.
pg.types.setTypeParser(1082, (value) => value);

const ssl =
  process.env.DB_SSL === "false"
    ? false
    : process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl,
});

export async function query(text, params = []) {
  return pool.query(text, params);
}

export async function withTransaction(work) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export default pool;
