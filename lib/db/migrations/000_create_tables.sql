-- Migration 000: Create initial tables
-- Run this first before other migrations

-- Enable UUID extension if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Alert types enum
DO $$ BEGIN
  CREATE TYPE alert_type AS ENUM ('TAF_AMD', 'TAF_COR', 'SPECI');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Alerts table
CREATE TABLE IF NOT EXISTS alerts (
  id          SERIAL       PRIMARY KEY,
  type        alert_type   NOT NULL,
  icao        TEXT         NOT NULL,
  raw_text    TEXT         NOT NULL,
  detected_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  acknowledged         BOOLEAN NOT NULL DEFAULT FALSE,
  acknowledged_at      TIMESTAMPTZ
);

-- Watchlist table
CREATE TABLE IF NOT EXISTS watchlist (
  id       SERIAL      PRIMARY KEY,
  icao     TEXT        NOT NULL UNIQUE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migration tracking table
CREATE TABLE IF NOT EXISTS _migrations (
  name    TEXT        PRIMARY KEY,
  ran_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
