-- Migration 001: Add indexes to alerts table for query performance
-- detected_at is used in WHERE clauses (gte filter for today's alerts)
-- acknowledged is used in WHERE clauses (unacked counts, hide-acked filter)
-- icao is used in WHERE + DISTINCT queries (inArray filter, airportsAffected)

CREATE INDEX IF NOT EXISTS idx_alerts_detected_at  ON alerts (detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_acknowledged  ON alerts (acknowledged);
CREATE INDEX IF NOT EXISTS idx_alerts_icao          ON alerts (icao);
