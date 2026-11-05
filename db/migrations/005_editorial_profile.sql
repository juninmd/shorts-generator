-- Migration 005: editorial profile per channel.
-- Explicit defaults keep the existing cuts flow unchanged: pt-BR, no theme filter,
-- both formats allowed (CHANNEL_FLOW_MODE still restricts at runtime) and auto publish.
ALTER TABLE channel_profiles ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'pt-BR';
ALTER TABLE channel_profiles ADD COLUMN IF NOT EXISTS allowed_themes TEXT NOT NULL DEFAULT '[]';
ALTER TABLE channel_profiles ADD COLUMN IF NOT EXISTS excluded_themes TEXT NOT NULL DEFAULT '[]';
ALTER TABLE channel_profiles ADD COLUMN IF NOT EXISTS tone TEXT NOT NULL DEFAULT '';
ALTER TABLE channel_profiles ADD COLUMN IF NOT EXISTS allowed_formats TEXT NOT NULL DEFAULT '["cuts","quiz"]';
ALTER TABLE channel_profiles ADD COLUMN IF NOT EXISTS publish_mode TEXT NOT NULL DEFAULT 'auto';
