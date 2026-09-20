-- Migration 007: performance snapshots for age-comparable feedback windows.
CREATE TABLE IF NOT EXISTS video_metric_snapshots (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  youtube_video_id TEXT NOT NULL,
  publication_id TEXT,
  title TEXT NOT NULL DEFAULT '',
  format TEXT NOT NULL DEFAULT 'cuts',
  theme TEXT,
  published_at TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  age_hours REAL NOT NULL,
  views INTEGER NOT NULL,
  likes INTEGER,
  comments INTEGER,
  avg_view_duration_sec REAL,
  avg_view_percentage REAL,
  subscribers_gained INTEGER,
  source TEXT NOT NULL CHECK (source IN ('analytics', 'public'))
);
CREATE INDEX IF NOT EXISTS video_metric_snapshots_channel_idx
  ON video_metric_snapshots (channel_id, youtube_video_id, captured_at);
