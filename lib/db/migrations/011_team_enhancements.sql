-- Migration 011: Team roles, reactions, replies, read receipts, event log
-- NOTE: documentation mirror only. The actual migration executed at startup
-- lives in lib/db/src/migrations.ts (MIGRATIONS array) — edit that file first.

ALTER TABLE team_members ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member';
UPDATE team_members tm
SET role = 'owner'
FROM teams t
WHERE tm.team_id = t.id AND tm.device_id = t.created_by_device_id AND tm.role <> 'owner';

ALTER TABLE team_notes ADD COLUMN IF NOT EXISTS reply_to_id INTEGER REFERENCES team_notes(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS team_note_reactions (
  id          SERIAL       PRIMARY KEY,
  note_id     INTEGER      NOT NULL REFERENCES team_notes(id) ON DELETE CASCADE,
  device_id   TEXT         NOT NULL,
  emoji       TEXT         NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (note_id, device_id, emoji)
);
CREATE INDEX IF NOT EXISTS idx_team_note_reactions_note_id ON team_note_reactions (note_id);

CREATE TABLE IF NOT EXISTS team_read_cursors (
  id                   SERIAL       PRIMARY KEY,
  team_id              INTEGER      NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  device_id            TEXT         NOT NULL,
  last_read_note_id    INTEGER,
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (team_id, device_id)
);

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
