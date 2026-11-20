-- Migration number: 0001 	 App tables for Chapter Tracker Web
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS series (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'weebcentral',
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  feed_url TEXT NOT NULL,
  site_url TEXT NOT NULL,
  latest_chapter_number REAL,
  latest_chapter_label TEXT,
  latest_chapter_title TEXT,
  latest_chapter_url TEXT,
  latest_published_at TEXT,
  next_check_at TEXT NOT NULL,
  last_checked_at TEXT,
  last_error TEXT,
  etag TEXT,
  last_modified TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (source, external_id)
);

CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY,
  series_id TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  chapter_number REAL NOT NULL,
  chapter_label TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  published_at TEXT,
  discovered_at TEXT NOT NULL,
  UNIQUE (series_id, chapter_number)
);

CREATE TABLE IF NOT EXISTS destinations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  label TEXT NOT NULL,
  webhook_ciphertext TEXT NOT NULL,
  webhook_iv TEXT NOT NULL,
  webhook_fingerprint TEXT NOT NULL,
  guild_id TEXT,
  guild_name TEXT,
  channel_id TEXT,
  channel_name TEXT,
  role_id TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  last_error TEXT,
  last_checked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, webhook_fingerprint)
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  series_id TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  destination_id TEXT NOT NULL REFERENCES destinations(id) ON DELETE RESTRICT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, series_id)
);

CREATE TABLE IF NOT EXISTS deliveries (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  destination_id TEXT NOT NULL REFERENCES destinations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'retry', 'failed', 'skipped')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  last_error TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (chapter_id, destination_id)
);

CREATE TABLE IF NOT EXISTS waitlist (
  id TEXT PRIMARY KEY,
  discord_id TEXT NOT NULL,
  username TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (discord_id)
);

CREATE TABLE IF NOT EXISTS job_locks (
  name TEXT PRIMARY KEY,
  locked_until TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS job_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  feeds_checked INTEGER NOT NULL DEFAULT 0,
  chapters_found INTEGER NOT NULL DEFAULT 0,
  deliveries_sent INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  detail TEXT
);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  window_start TEXT NOT NULL,
  count INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_series_due ON series(active, next_check_at);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_series ON subscriptions(series_id);
CREATE INDEX IF NOT EXISTS idx_destinations_user ON destinations(user_id);
CREATE INDEX IF NOT EXISTS idx_chapters_series ON chapters(series_id, chapter_number);
CREATE INDEX IF NOT EXISTS idx_deliveries_due ON deliveries(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_deliveries_destination ON deliveries(destination_id);
CREATE INDEX IF NOT EXISTS idx_job_runs_started ON job_runs(started_at);
