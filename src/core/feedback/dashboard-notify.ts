import type { SqlClient } from "../control-plane-db.js";
import { logger } from "../logger.js";
import { sendTelegramMessage } from "../telegram-bot.js";
import type { PipelineConfig } from "../../types.js";
import { buildDashboardData, summarizeDashboard } from "./dashboard-service.js";

/** UTC calendar day, so the guard is stable across worker restarts/timezones. */
function todayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function dashboardUrl(): string | null {
  const base = process.env.PUBLIC_BASE_URL?.trim();
  const token = process.env.ADMIN_API_TOKEN?.trim();
  if (!base) return null;
  const path = "/dashboard";
  return token ? `${base}${path}?token=${encodeURIComponent(token)}` : `${base}${path}`;
}

/** Reserves today's slot atomically; returns false if another process already sent it. */
async function claimToday(db: SqlClient, now: Date, channelCount: number): Promise<boolean> {
  const result = await db.query(
    `INSERT INTO dashboard_notifications (sent_date, sent_at, channel_count) VALUES ($1, $2, $3)
     ON CONFLICT (sent_date) DO NOTHING`,
    [todayKey(now), now.toISOString(), channelCount],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Sends the dashboard link to Telegram once per UTC day. Safe to call from any
 * interval cadence (e.g. the existing feedback-collection timer) — the DB
 * unique constraint on sent_date is the source of truth, not the caller's clock.
 */
export async function sendDailyDashboardDigest(db: SqlClient, config: PipelineConfig, now = new Date()): Promise<"sent" | "skipped" | "no_url" | "no_telegram"> {
  const url = dashboardUrl();
  if (!url) return "no_url";
  if (!config.telegramBotToken || !config.telegramChatId) return "no_telegram";

  const data = await buildDashboardData(db, now);
  const claimed = await claimToday(db, now, data.channels.length);
  if (!claimed) return "skipped";

  const message = [
    "📊 <b>Dashboard diário de métricas</b>",
    "──────────────────────",
    summarizeDashboard(data),
    "──────────────────────",
    `🔗 <a href="${url}">Abrir dashboard completo</a>`,
  ].join("\n");

  try {
    await sendTelegramMessage(config, message);
    return "sent";
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, "dashboard-notify: failed to send Telegram digest");
    throw error;
  }
}
