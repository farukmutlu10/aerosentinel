import { pool } from "@workspace/db";

const MIGRATIONS: Array<{ name: string; sql: string }> = [
  {
    name: "000_create_tables",
    sql: `
      DO $$ BEGIN
        CREATE TYPE alert_type AS ENUM ('TAF_AMD', 'TAF_COR', 'SPECI');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;

      CREATE TABLE IF NOT EXISTS alerts (
        id          SERIAL       PRIMARY KEY,
        type        alert_type   NOT NULL,
        icao        TEXT         NOT NULL,
        raw_text    TEXT         NOT NULL,
        detected_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        acknowledged         BOOLEAN NOT NULL DEFAULT FALSE,
        acknowledged_at      TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS watchlist (
        id       SERIAL      PRIMARY KEY,
        icao     TEXT        NOT NULL UNIQUE,
        added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS _migrations (
        name    TEXT        PRIMARY KEY,
        ran_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `,
  },
  {
    name: "001_alerts_indexes",
    sql: `
      CREATE INDEX IF NOT EXISTS idx_alerts_detected_at ON alerts (detected_at DESC);
      CREATE INDEX IF NOT EXISTS idx_alerts_acknowledged  ON alerts (acknowledged);
      CREATE INDEX IF NOT EXISTS idx_alerts_icao          ON alerts (icao);
    `,
  },
  {
    name: "002_add_user_id",
    sql: `
      ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT 'legacy';
      ALTER TABLE watchlist DROP CONSTRAINT IF EXISTS watchlist_icao_unique;
      ALTER TABLE watchlist ADD CONSTRAINT watchlist_user_icao_unique UNIQUE (user_id, icao);
    `,
  },
];

export async function runMigrations(): Promise<void> {
  // Skip migrations when using in-memory database (no PostgreSQL available)
  if (!pool) {
    console.log("[migrate] In-memory mode — skipping migrations");
    return;
  }

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
    }
  } finally {
    client.release();
  }
}
