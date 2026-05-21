ALTER TABLE managed_channels ADD COLUMN IF NOT EXISTS channel_type TEXT NOT NULL DEFAULT 'cuts';
