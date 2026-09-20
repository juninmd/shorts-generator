import { beforeEach, describe, expect, it, vi } from "vitest";
import { getLocalPool } from "../../../src/core/sqlite-db.js";
import { runControlPlaneMigrations } from "../../../src/core/control-plane-migrations.js";
import { ChannelBundleRepository } from "../../../src/core/channel-bundle-repository.js";
import { SnapshotRepository } from "../../../src/core/feedback/snapshot-repository.js";
import { buildDashboardData, summarizeDashboard } from "../../../src/core/feedback/dashboard-service.js";
import { sendDailyDashboardDigest } from "../../../src/core/feedback/dashboard-notify.js";
import type { SqlClient } from "../../../src/core/control-plane-db.js";

vi.mock("../../../src/core/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const sendMock = vi.hoisted(() => vi.fn().mockResolvedValue({ message_id: 1 }));
vi.mock("../../../src/core/telegram-bot.js", () => ({ sendTelegramMessage: sendMock, getBot: vi.fn() }));

describe("dashboard aggregation and daily Telegram digest", () => {
  let db: SqlClient;
  const now = new Date("2026-09-10T12:00:00Z");
  const config = { telegramBotToken: "t", telegramChatId: "c" } as any;

  async function seedChannel(id: string) {
    await db.query(
      `INSERT INTO managed_channels (id, slug, name, description, status, logo_path, watermark_text, channel_type, created_at, updated_at)
       VALUES ($1, $1, 'Canal A', '', 'active', NULL, '', 'cuts', $2, $2)`,
      [id, now.toISOString()],
    );
    await db.query(
      `INSERT INTO channel_profiles (channel_id, video_limit, min_short_duration, max_short_duration, target_shorts, video_query, sort_by_views, ai_provider, ai_model)
       VALUES ($1, 3, 20, 60, NULL, NULL, false, 'openrouter', 'x')`,
      [id],
    );
  }

  async function snapshot(channelId: string, videoId: string, capturedAt: Date, views: number) {
    await new SnapshotRepository(db).insert(
      channelId,
      { publicationId: `p-${videoId}`, youtubeVideoId: videoId, title: `T-${videoId}`, format: "cuts", theme: null, publishedAt: now.toISOString() },
      capturedAt,
      { views, source: "public" },
    );
  }

  beforeEach(async () => {
    sendMock.mockClear();
    db = getLocalPool({ databaseUrl: "sqlite::memory:" });
    await runControlPlaneMigrations(db);
    await seedChannel("chan-a");
  });

  it("aggregates one point per calendar day across videos", async () => {
    await snapshot("chan-a", "v1", new Date("2026-09-09T10:00:00Z"), 100);
    await snapshot("chan-a", "v1", new Date("2026-09-09T20:00:00Z"), 150); // same day, keeps the latest
    await snapshot("chan-a", "v2", new Date("2026-09-10T08:00:00Z"), 40);

    const series = await new SnapshotRepository(db).dailySeries("chan-a", now);
    expect(series).toEqual([
      { day: "2026-09-09", totalViews: 150, avgViewPercentage: null, videoCount: 1 },
      { day: "2026-09-10", totalViews: 40, avgViewPercentage: null, videoCount: 1 },
    ]);
  });

  it("builds dashboard data only for active channels with their daily series", async () => {
    await snapshot("chan-a", "v1", now, 500);
    const bundles = await new ChannelBundleRepository(db).listBundles();
    expect(bundles).toHaveLength(1);

    const data = await buildDashboardData(db, now);
    expect(data.channels).toHaveLength(1);
    expect(data.channels[0]!.channelId).toBe("chan-a");
    expect(data.channels[0]!.series.at(-1)!.totalViews).toBe(500);
    expect(summarizeDashboard(data)).toContain("Canal A");
  });

  it("summarizes an empty dashboard without crashing", () => {
    expect(summarizeDashboard({ generatedAt: now.toISOString(), channels: [] })).toContain("Nenhum canal");
  });

  it("sends exactly one Telegram digest per day, even across repeated calls", async () => {
    process.env.PUBLIC_BASE_URL = "https://dashboard.example.com";
    process.env.ADMIN_API_TOKEN = "secret-token";

    const first = await sendDailyDashboardDigest(db, config, now);
    const second = await sendDailyDashboardDigest(db, config, now);

    expect(first).toBe("sent");
    expect(second).toBe("skipped");
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0]![1]).toContain("dashboard.example.com/dashboard?token=secret-token");

    delete process.env.PUBLIC_BASE_URL;
    delete process.env.ADMIN_API_TOKEN;
  });

  it("skips without sending when PUBLIC_BASE_URL is not configured", async () => {
    delete process.env.PUBLIC_BASE_URL;
    const outcome = await sendDailyDashboardDigest(db, config, now);
    expect(outcome).toBe("no_url");
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("skips without sending when Telegram is not configured", async () => {
    process.env.PUBLIC_BASE_URL = "https://dashboard.example.com";
    const outcome = await sendDailyDashboardDigest(db, { telegramBotToken: "", telegramChatId: "" } as any, now);
    expect(outcome).toBe("no_telegram");
    expect(sendMock).not.toHaveBeenCalled();
    delete process.env.PUBLIC_BASE_URL;
  });
});
