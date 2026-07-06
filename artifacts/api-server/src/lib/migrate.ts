import { pool, MIGRATIONS } from "@workspace/db";
import { logger } from "./logger.js";

export async function runMigrations(): Promise<void> {
  // Skip migrations when using in-memory database (no PostgreSQL available)
  if (!pool) {
    logger.info("[migrate] In-memory mode — skipping migrations");
    return;
  }

  logger.info("[migrate] Connecting to PostgreSQL...");
  // Add a connection timeout to prevent hanging if DB is unreachable
  const connectTimeout = setTimeout(() => {
    logger.error("[migrate] ❌ PostgreSQL connection is taking >10s — DB may be unreachable");
  }, 10_000);

  let client;
  try {
    client = await pool.connect();
    clearTimeout(connectTimeout);
    logger.info("[migrate] ✅ PostgreSQL connected successfully");
  } catch (err) {
    clearTimeout(connectTimeout);
    logger.error({ err }, "[migrate] ❌ PostgreSQL connection FAILED");
    throw err;
  }
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name    TEXT        PRIMARY KEY,
        ran_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    for (const m of MIGRATIONS) {
      const { rows } = await client.query(
        "SELECT name FROM _migrations WHERE name = $1",
        [m.name],
      );
      if (rows.length > 0) continue;
      await client.query(m.sql);
      await client.query("INSERT INTO _migrations (name) VALUES ($1)", [m.name]);
    }
  } finally {
    client.release();
  }
}
