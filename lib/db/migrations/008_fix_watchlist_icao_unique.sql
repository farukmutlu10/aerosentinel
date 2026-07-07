-- Migration 008: Remove the stale global UNIQUE(icao) constraint on watchlist.
--
-- Migration 000 created `icao TEXT NOT NULL UNIQUE`, which Postgres auto-named
-- `watchlist_icao_key`. Migration 002 tried to drop `watchlist_icao_unique`
-- (the WRONG name), so the global UNIQUE(icao) constraint silently survived in
-- production. Because both POST /watchlist and PUT /watchlist/sync insert with
-- ON CONFLICT DO NOTHING (no target), adding an airport that ANY other device
-- already watches hits the global icao conflict and is silently skipped — so
-- most users' server-side watchlists stay empty, and GET /alerts (which filters
-- by that table) returns nothing. Alerts then only reach the client via the
-- /watchlist/sync initial-alerts snapshot (queried by request icaos, bypassing
-- the table), i.e. only on page load/refresh, never through the 30s poll.
--
-- Drop any single-column UNIQUE constraint on watchlist.icao, whatever its
-- actual name, leaving only the correct UNIQUE(user_id, icao). Idempotent.
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
        SELECT array_agg(a.attname ORDER BY a.attnum)
        FROM unnest(c.conkey) AS k(attnum)
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
      ) = ARRAY['icao']
  LOOP
    EXECUTE format('ALTER TABLE watchlist DROP CONSTRAINT %I', con_name);
  END LOOP;
END $$;
