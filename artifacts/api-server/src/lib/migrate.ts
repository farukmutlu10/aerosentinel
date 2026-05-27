import { pool } from "@workspace/db";

const MIGRATIONS: Array<{ name: string; sql: string }> = [
  {
    name: "001_alerts_indexes",
    sql: `
      CREATE INDEX IF NOT EXISTS idx_alerts_detected_at ON alerts (detected_at DESC);
      CREATE INDEX IF NOT EXISTS idx_alerts_acknowledged  ON alerts (acknowledged);
      CREATE INDEX IF NOT EXISTS idx_alerts_icao          ON alerts (icao);
    `,
  },
];

export async function runMigrations(): Promise<void> {
  const client = await pool.connect();
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
      console.log(`[migrate] applied: ${m.name}`);
    }
  } finally {
    client.release();
  }
}
