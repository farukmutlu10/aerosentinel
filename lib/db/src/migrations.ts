/**
 * Single source of truth for the raw-SQL migrations applied at api-server
 * startup (see artifacts/api-server/src/lib/migrate.ts).
 *
 * The human-readable copies under lib/db/migrations/*.sql mirror this array
 * for history/reference — they are not read by any tooling (drizzle-kit is
 * configured for `push`, not migration generation). If you add a migration,
 * add it here first, then add a matching .sql file for the record.
 */
export const MIGRATIONS: Array<{ name: string; sql: string }> = [
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
  {
    name: "003_add_previous_raw_text",
    sql: `
      ALTER TABLE alerts ADD COLUMN IF NOT EXISTS previous_raw_text text;
    `,
  },
  {
    name: "004_create_monitor_cache",
    sql: `
      CREATE TABLE IF NOT EXISTS monitor_cache (
        icao VARCHAR(10) NOT NULL,
        data_type VARCHAR(10) NOT NULL,
        raw_text TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        PRIMARY KEY (icao, data_type)
      );
    `,
  },
  {
    name: "005_add_wx_wind_extreme",
    sql: `
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'alert_type' AND e.enumlabel = 'WX_EXTREME') THEN
          ALTER TYPE alert_type ADD VALUE 'WX_EXTREME';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'alert_type' AND e.enumlabel = 'WIND_EXTREME') THEN
          ALTER TYPE alert_type ADD VALUE 'WIND_EXTREME';
        END IF;
      END$$;
    `,
  },
  {
    name: "006_add_lifr",
    sql: `
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'alert_type' AND e.enumlabel = 'LIFR') THEN
          ALTER TYPE alert_type ADD VALUE 'LIFR';
        END IF;
      END$$;
    `,
  },
  {
    name: "007_create_push_subscriptions",
    sql: `
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id          SERIAL       PRIMARY KEY,
        user_id     TEXT         NOT NULL DEFAULT 'legacy',
        endpoint    TEXT         NOT NULL UNIQUE,
        p256dh      TEXT         NOT NULL,
        auth        TEXT         NOT NULL,
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_push_sub_user_id ON push_subscriptions (user_id);
    `,
  },
];
