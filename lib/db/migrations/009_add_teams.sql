-- Migration 009: Teams mode — shared watchlist, presence, shift-handoff notes
-- NOTE: documentation mirror only. The actual migration executed at startup
-- lives in lib/db/src/migrations.ts (MIGRATIONS array) — edit that file first.

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
