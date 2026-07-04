-- Migration 005: Add WX_EXTREME and WIND_EXTREME to alert_type enum
-- Preview only — do NOT run in production yet

ALTER TYPE alert_type ADD VALUE IF NOT EXISTS 'WX_EXTREME';
ALTER TYPE alert_type ADD VALUE IF NOT EXISTS 'WIND_EXTREME';
