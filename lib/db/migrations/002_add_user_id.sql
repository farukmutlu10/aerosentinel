-- Migration 002: Add user_id to watchlist for multi-user support
ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT 'legacy';
-- Mevcut kayıtlar 'legacy' olarak işaretlenir, silinmez
-- Yeni primary key: (user_id, icao) çifti
-- Eski unique constraint'i kaldır, yeni composite unique ekle
ALTER TABLE watchlist DROP CONSTRAINT IF EXISTS watchlist_icao_unique;
ALTER TABLE watchlist ADD CONSTRAINT watchlist_user_icao_unique UNIQUE (user_id, icao);
