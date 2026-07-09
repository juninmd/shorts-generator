-- Migration 004: Add channel_id to posted_source_videos and update PK to (channel_id, video_id)

ALTER TABLE posted_source_videos ADD COLUMN IF NOT EXISTS channel_id TEXT NOT NULL DEFAULT 'global';
ALTER TABLE posted_source_videos DROP CONSTRAINT IF EXISTS posted_source_videos_pkey;
ALTER TABLE posted_source_videos ADD PRIMARY KEY (channel_id, video_id);
