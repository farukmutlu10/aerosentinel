-- Migration 003: Add previous_raw_text to alerts for TAF/METAR diff view
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS previous_raw_text text;
