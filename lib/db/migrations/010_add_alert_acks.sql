-- Migration 010: per-device alert acknowledgements
-- NOTE: documentation mirror only. The actual migration executed at startup
-- lives in lib/db/src/migrations.ts (MIGRATIONS array) — edit that file first.

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
