-- Migration 006: durable clip history, reservation, review queue and editorial decisions.
-- Timestamps are ISO-8601 strings written by the application so the same SQL runs on SQLite.
CREATE TABLE IF NOT EXISTS clip_publications (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  run_id TEXT,
  source_video_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_start_ms INTEGER NOT NULL,
  source_end_ms INTEGER NOT NULL,
  text_signature TEXT NOT NULL,
  normalized_text TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  approved_version INTEGER,
  approved_by TEXT,
  approved_at TEXT,
  title TEXT NOT NULL DEFAULT '',
  description_body TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  presenter TEXT,
  language TEXT NOT NULL DEFAULT 'pt-BR',
  selection_reason TEXT NOT NULL DEFAULT '',
  review_notes TEXT NOT NULL DEFAULT '',
  requires_human_review BOOLEAN NOT NULL DEFAULT FALSE,
  artifact_path TEXT,
  subtitle_path TEXT,
  artifact_hash TEXT,
  format TEXT NOT NULL DEFAULT 'cuts',
  theme TEXT,
  youtube_video_id TEXT,
  published_at TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  lease_expires_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS clip_publications_channel_source_idx
  ON clip_publications (channel_id, source_video_id);
CREATE INDEX IF NOT EXISTS clip_publications_channel_status_idx
  ON clip_publications (channel_id, status);
CREATE INDEX IF NOT EXISTS clip_publications_run_idx ON clip_publications (run_id);
-- Same textual content can only be active once per destination channel.
CREATE UNIQUE INDEX IF NOT EXISTS clip_publications_active_signature_uq
  ON clip_publications (channel_id, text_signature)
  WHERE status NOT IN ('failed', 'rejected', 'expired');

-- Row used as a mutex so reservations for one channel+source are serialized.
CREATE TABLE IF NOT EXISTS clip_reservation_locks (
  channel_id TEXT NOT NULL,
  source_video_id TEXT NOT NULL,
  locked_at TEXT NOT NULL,
  PRIMARY KEY (channel_id, source_video_id)
);

CREATE TABLE IF NOT EXISTS editorial_decisions (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  channel_id TEXT NOT NULL,
  source_video_id TEXT,
  source_start_ms INTEGER,
  source_end_ms INTEGER,
  title TEXT NOT NULL DEFAULT '',
  stage TEXT NOT NULL,
  decision TEXT NOT NULL,
  reasons TEXT NOT NULL DEFAULT '[]',
  scores TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS editorial_decisions_channel_idx ON editorial_decisions (channel_id, created_at);
