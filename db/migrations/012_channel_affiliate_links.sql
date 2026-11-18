-- Migration 012: links de afiliado por canal, anexados ao comentário fixo dos vídeos.
CREATE TABLE IF NOT EXISTS channel_affiliate_links (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES managed_channels(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE (channel_id, url)
);

CREATE INDEX IF NOT EXISTS idx_channel_affiliate_links_channel
  ON channel_affiliate_links (channel_id, position);
