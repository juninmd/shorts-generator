-- Migration 013: pool global de links de afiliado (vale para qualquer canal).
-- Os links por canal continuam em channel_affiliate_links; o pool global é
-- combinado com eles na leitura (ver ChannelAffiliateRepository.listActive).
CREATE TABLE IF NOT EXISTS affiliate_links (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_affiliate_links_position
  ON affiliate_links (position);
