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
  {
    // ── The bug this fixes ──────────────────────────────────────────────────
    // Migration 000 created the watchlist table with `icao TEXT NOT NULL
    // UNIQUE`, which Postgres auto-named `watchlist_icao_key`. Migration 002
    // (multi-user support) tried to drop it with
    // `DROP CONSTRAINT IF EXISTS watchlist_icao_unique` — the WRONG name — so
    // the global UNIQUE(icao) constraint silently survived in every production
    // database. Its effect: because both POST /watchlist and PUT
    // /watchlist/sync insert with `ON CONFLICT DO NOTHING` (no target),
    // adding an airport that ANY OTHER device already watches hits the global
    // icao conflict and is silently skipped. So the first device to watch an
    // airport "owns" it, and every other user's watchlist ends up largely
    // empty on the server — which makes GET /alerts (it filters by the
    // server-side watchlist table) return nothing, so alerts only ever reach
    // the client through the /watchlist/sync initial-alerts snapshot (which
    // queries by the request's icaos, bypassing the table) — i.e. only on a
    // page load/refresh, never through the 30s poll. The in-memory dev
    // fallback dedupes on (icao,userId), so this never reproduced locally.
    //
    // Drop any single-column UNIQUE constraint on watchlist.icao, whatever its
    // actual name, leaving only the correct UNIQUE(user_id, icao). Idempotent.
    name: "008_fix_watchlist_icao_unique",
    sql: `
      DO $$
      DECLARE con_name text;
      BEGIN
        FOR con_name IN
          SELECT c.conname
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          WHERE t.relname = 'watchlist'
            AND c.contype = 'u'
            AND (
              SELECT array_agg(a.attname::text ORDER BY a.attnum)
              FROM unnest(c.conkey) AS k(attnum)
              JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
            ) = ARRAY['icao']::text[]
        LOOP
          EXECUTE format('ALTER TABLE watchlist DROP CONSTRAINT %I', con_name);
        END LOOP;
      END $$;
    `,
  },
  {
    name: "009_add_teams",
    sql: `
      CREATE TABLE IF NOT EXISTS teams (
        id                     SERIAL       PRIMARY KEY,
        code                   TEXT         NOT NULL UNIQUE,
        name                   TEXT,
        created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        created_by_device_id   TEXT         NOT NULL
      );

      CREATE TABLE IF NOT EXISTS team_members (
        id            SERIAL       PRIMARY KEY,
        team_id       INTEGER      NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        device_id     TEXT         NOT NULL,
        nickname      TEXT,
        avatar        TEXT,
        joined_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        last_seen_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        UNIQUE (team_id, device_id)
      );
      CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members (team_id);

      CREATE TABLE IF NOT EXISTS team_watchlist (
        id                   SERIAL       PRIMARY KEY,
        team_id              INTEGER      NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        icao                 TEXT         NOT NULL,
        added_by_device_id   TEXT,
        added_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        UNIQUE (team_id, icao)
      );
      CREATE INDEX IF NOT EXISTS idx_team_watchlist_icao ON team_watchlist (icao);

      CREATE TABLE IF NOT EXISTS team_notes (
        id          SERIAL       PRIMARY KEY,
        team_id     INTEGER      NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        device_id   TEXT         NOT NULL,
        nickname    TEXT,
        body        TEXT         NOT NULL,
        pinned      BOOLEAN      NOT NULL DEFAULT FALSE,
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_team_notes_team_id ON team_notes (team_id, created_at DESC);

      ALTER TABLE alerts ADD COLUMN IF NOT EXISTS acknowledged_by_device_id TEXT;
      ALTER TABLE alerts ADD COLUMN IF NOT EXISTS acknowledged_by_nickname TEXT;
    `,
  },
  {
    name: "010_add_alert_acks",
    sql: `
      CREATE TABLE IF NOT EXISTS alert_acks (
        id         SERIAL       PRIMARY KEY,
        alert_id   INTEGER      NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
        device_id  TEXT         NOT NULL,
        nickname   TEXT,
        acked_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        UNIQUE (alert_id, device_id)
      );
      CREATE INDEX IF NOT EXISTS idx_alert_acks_alert_id ON alert_acks (alert_id);
      CREATE INDEX IF NOT EXISTS idx_alert_acks_device_id ON alert_acks (device_id);
    `,
  },
  {
    name: "011_team_enhancements",
    sql: `
      -- Roles: exactly one 'owner' per team (the creator), everyone else 'member'.
      ALTER TABLE team_members ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member';
      UPDATE team_members tm
      SET role = 'owner'
      FROM teams t
      WHERE tm.team_id = t.id AND tm.device_id = t.created_by_device_id AND tm.role <> 'owner';

      -- Replies: a note can quote an earlier note in the same team.
      ALTER TABLE team_notes ADD COLUMN IF NOT EXISTS reply_to_id INTEGER REFERENCES team_notes(id) ON DELETE SET NULL;

      -- Reactions: multiple emoji per note, one per (note, device, emoji).
      CREATE TABLE IF NOT EXISTS team_note_reactions (
        id          SERIAL       PRIMARY KEY,
        note_id     INTEGER      NOT NULL REFERENCES team_notes(id) ON DELETE CASCADE,
        device_id   TEXT         NOT NULL,
        emoji       TEXT         NOT NULL,
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        UNIQUE (note_id, device_id, emoji)
      );
      CREATE INDEX IF NOT EXISTS idx_team_note_reactions_note_id ON team_note_reactions (note_id);

      -- Read cursor per member: "seen everything up through note id N" —
      -- one row per (team, device) rather than one row per message, so
      -- computing "seen by" for a message is a cheap >= comparison instead
      -- of an ever-growing per-message read-receipt table.
      CREATE TABLE IF NOT EXISTS team_read_cursors (
        id                   SERIAL       PRIMARY KEY,
        team_id              INTEGER      NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        device_id            TEXT         NOT NULL,
        last_read_note_id    INTEGER,
        updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        UNIQUE (team_id, device_id)
      );

      -- Team-level audit/system-message log: joins, leaves, kicks,
      -- ownership transfers, renames. Powers both the Activity tab and
      -- the chat's inline "X joined the team" system messages.
      CREATE TABLE IF NOT EXISTS team_events (
        id          SERIAL       PRIMARY KEY,
        team_id     INTEGER      NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        device_id   TEXT,
        nickname    TEXT,
        type        TEXT         NOT NULL,
        detail      TEXT,
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_team_events_team_id ON team_events (team_id, created_at DESC);
    `,
  },
];
