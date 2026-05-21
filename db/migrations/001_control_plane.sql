CREATE TABLE IF NOT EXISTS managed_channels (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  logo_path TEXT,
  watermark_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS channel_profiles (
  channel_id TEXT PRIMARY KEY REFERENCES managed_channels(id) ON DELETE CASCADE,
  video_limit INTEGER NOT NULL,
  min_short_duration INTEGER NOT NULL,
  max_short_duration INTEGER NOT NULL,
  target_shorts INTEGER,
  video_query TEXT,
  sort_by_views BOOLEAN NOT NULL DEFAULT FALSE,
  ai_provider TEXT NOT NULL,
  ai_model TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS channel_focuses (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES managed_channels(id) ON DELETE CASCADE,
  focus_key TEXT NOT NULL,
  focus_label TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS source_targets (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES managed_channels(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS publishing_accounts (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL UNIQUE REFERENCES managed_channels(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  account_identifier TEXT NOT NULL,
  client_id TEXT,
  client_secret TEXT,
  token_key_version TEXT NOT NULL,
  token_iv TEXT NOT NULL,
  token_auth_tag TEXT NOT NULL,
  token_ciphertext TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id TEXT PRIMARY KEY,
  channel_id TEXT REFERENCES managed_channels(id) ON DELETE CASCADE,
  requested_by TEXT NOT NULL,
  status TEXT NOT NULL,
  snapshot JSONB NOT NULL,
  progress JSONB,
  results JSONB NOT NULL DEFAULT '[]'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS publication_records (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL REFERENCES managed_channels(id) ON DELETE CASCADE,
  short_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  destination_url TEXT,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_channel_quotas (
  quota_day DATE NOT NULL,
  channel_id TEXT NOT NULL,
  publish_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (quota_day, channel_id)
);

CREATE TABLE IF NOT EXISTS posted_source_videos (
  video_id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);