-- Migration 011: cortes manuais, agenda programada e análise do vídeo-fonte (Radar).
CREATE TABLE IF NOT EXISTS channel_manual_cuts (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES managed_channels(id) ON DELETE CASCADE,
  source_video_id TEXT NOT NULL,
  title TEXT NOT NULL,
  start_sec NUMERIC NOT NULL,
  end_sec NUMERIC NOT NULL,
  created_at TEXT NOT NULL,
  CHECK (end_sec > start_sec)
);

CREATE TABLE IF NOT EXISTS channel_schedule_entries (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES managed_channels(id) ON DELETE CASCADE,
  cut_id TEXT REFERENCES channel_manual_cuts(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('programmed', 'manual')),
  run_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS channel_source_analysis (
  channel_id TEXT NOT NULL REFERENCES managed_channels(id) ON DELETE CASCADE,
  source_video_id TEXT NOT NULL,
  duration_sec NUMERIC NOT NULL,
  analysis JSONB NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (channel_id, source_video_id)
);
