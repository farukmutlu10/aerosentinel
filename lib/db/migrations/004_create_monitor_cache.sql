-- Monitor cache: persist last-seen TAF/METAR raw text per ICAO
-- so change detection survives server restarts.
CREATE TABLE IF NOT EXISTS monitor_cache (
  icao VARCHAR(10) NOT NULL,
  data_type VARCHAR(10) NOT NULL,  -- 'TAF' or 'METAR'
  raw_text TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (icao, data_type)
);
