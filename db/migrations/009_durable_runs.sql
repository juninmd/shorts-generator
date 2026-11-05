-- Migration 009: durable run execution (queue + worker) with checkpoints and leases.
-- Legacy rows keep status 'completed'/'processing'/'failed' and stay readable.
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS checkpoint TEXT;
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS options TEXT;
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS lease_owner TEXT;
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS lease_expires_at TEXT;
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS summary TEXT;
