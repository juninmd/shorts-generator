-- Migration 008: reviewed quiz question bank with provenance and per-channel usage history.
CREATE TABLE IF NOT EXISTS quiz_questions (
  id TEXT PRIMARY KEY,
  question_hash TEXT NOT NULL UNIQUE,
  theme TEXT NOT NULL,
  question TEXT NOT NULL,
  options TEXT NOT NULL,
  correct_option TEXT NOT NULL,
  source_url TEXT,
  source_title TEXT,
  source_excerpt TEXT,
  verified_by TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('approved', 'pending_review', 'rejected')),
  reviewed_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS quiz_questions_theme_status_idx ON quiz_questions (theme, status);

CREATE TABLE IF NOT EXISTS quiz_question_usage (
  channel_id TEXT NOT NULL,
  question_hash TEXT NOT NULL,
  used_at TEXT NOT NULL,
  PRIMARY KEY (channel_id, question_hash, used_at)
);
