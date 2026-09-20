-- Migration 010: idempotency guard for the daily dashboard-link Telegram digest.
CREATE TABLE IF NOT EXISTS dashboard_notifications (
  sent_date TEXT PRIMARY KEY,
  sent_at TEXT NOT NULL,
  channel_count INTEGER NOT NULL
);
