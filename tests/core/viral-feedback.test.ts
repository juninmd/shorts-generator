import { beforeEach, describe, expect, it, vi } from "vitest";
import { getLocalPool } from "../../src/core/sqlite-db.js";
import { runControlPlaneMigrations } from "../../src/core/control-plane-migrations.js";
import { formatFeedbackForPrompt, getChannelFeedback, resolveChannelHandle } from "../../src/core/viral-feedback.js";
import { byFormat, classifyWindow, MIN_SAMPLE, type MetricSnapshot } from "../../src/core/feedback/window-classifier.js";
import { clearMetricsCache, collectChannelSnapshots } from "../../src/core/feedback/snapshot-collector.js";
import { classifyMetricsError } from "../../src/core/feedback/metrics-sources.js";
import type { SqlClient } from "../../src/core/control-plane-db.js";

vi.mock("../../src/core/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const snap = (id: string, ageHours: number, views: number, format = "cuts"): MetricSnapshot =>
  ({ youtubeVideoId: id, title: `T-${id}`, format, theme: null, ageHours, views });

describe("classifyWindow", () => {
  it("never ranks a recent video as a flop because of its age", () => {
    const mature = Array.from({ length: MIN_SAMPLE }, (_, i) => snap(`m${i}`, 80, 1000 + i * 100));
    const fresh = snap("fresh", 5, 3); // 5h old with 3 views
    const [group] = classifyWindow([...mature, fresh], "72h", byFormat);
    expect(group!.status).toBe("ok");
    expect(group!.immature).toBe(1);
    expect(group!.flop.map((v) => v.youtubeVideoId)).not.toContain("fresh");
    expect(group!.top[0]!.youtubeVideoId).toBe("m7");
  });

  it("uses the snapshot taken at the window age, not the accumulated views", () => {
    const videos = Array.from({ length: MIN_SAMPLE }, (_, i) => [snap(`v${i}`, 25, 100 + i), snap(`v${i}`, 300, i === 0 ? 1_000_000 : 200)]).flat();
    const [group] = classifyWindow(videos, "24h", byFormat);
    expect(group!.top[0]!.views).toBeLessThan(1000);
  });

  it("suspends ranking below the minimum sample and separates formats", () => {
    const groups = classifyWindow([snap("a", 30, 10), snap("b", 30, 10, "quiz")], "24h", byFormat);
    expect(groups.map((g) => g.key).sort()).toEqual(["cuts|*", "quiz|*"]);
    expect(groups.every((g) => g.status === "insufficient_sample" && g.top.length === 0)).toBe(true);
  });
});

describe("metrics collection and feedback (sqlite)", () => {
  let db: SqlClient;
  const config = { managedRun: { runId: "r", channelId: "chan-a", channelName: "A", focusLabels: [], channelType: "cuts" } } as any;
  const now = new Date("2026-09-10T12:00:00Z");

  async function publish(id: string, hoursAgo: number, channel = "chan-a") {
    const at = new Date(now.getTime() - hoursAgo * 3_600_000).toISOString();
    await db.query(
      `INSERT INTO clip_publications (id, channel_id, source_video_id, source_url, source_start_ms, source_end_ms, text_signature, status, title, youtube_video_id, published_at, created_at, updated_at)
       VALUES ($1, $2, 'src', 'https://youtu.be/src', 0, 1000, $3, 'published', $4, $5, $6, $6, $6)`,
      [id, channel, `sig-${id}`, `Título ${id}`, `yt-${id}`, at],
    );
  }

  beforeEach(async () => {
    clearMetricsCache();
    db = getLocalPool({ databaseUrl: "sqlite::memory:" });
    await runControlPlaneMigrations(db);
  });

  it("stores Analytics snapshots and falls back to public counts on missing permission", async () => {
    await publish("p1", 30);
    const analytics = vi.fn().mockResolvedValue({ status: "ok", metrics: new Map([["yt-p1", { views: 50, avgViewPercentage: 71, subscribersGained: 2, source: "analytics" }]]) });
    const report = await collectChannelSnapshots(db, "chan-a", config, { analytics, now });
    expect(report).toMatchObject({ collected: 1, source: "analytics" });

    clearMetricsCache();
    const denied = vi.fn().mockResolvedValue({ status: "no_permission", error: "insufficient scope" });
    const publicStats = vi.fn().mockResolvedValue({ status: "ok", metrics: new Map([["yt-p1", { views: 60, source: "public" }]]) });
    const fallback = await collectChannelSnapshots(db, "chan-a", config, { analytics: denied, publicStats, now });
    expect(fallback).toMatchObject({ collected: 1, source: "public", analyticsStatus: "no_permission", publicStatus: "ok" });
  });

  it("caches analytics answers (including quota errors) and reports total failure honestly", async () => {
    await publish("p1", 30);
    const quota = vi.fn().mockResolvedValue({ status: "quota", error: "quotaExceeded" });
    const publicStats = vi.fn().mockResolvedValue({ status: "error", error: "yt-dlp missing" });
    const first = await collectChannelSnapshots(db, "chan-a", config, { analytics: quota, publicStats, now });
    await collectChannelSnapshots(db, "chan-a", config, { analytics: quota, publicStats, now });
    expect(quota).toHaveBeenCalledTimes(1);
    expect(first).toMatchObject({ collected: 0, source: "none", analyticsStatus: "quota", publicStatus: "error" });
    expect(await collectChannelSnapshots(db, "empty", config, { analytics: quota, now })).toMatchObject({ candidates: 0, source: "none" });
  });

  it("feeds prompts only with mature, same-age comparisons of the same channel", async () => {
    for (let i = 0; i < MIN_SAMPLE; i++) await publish(`v${i}`, 75);
    await publish("other", 75, "chan-b");
    const views = new Map(Array.from({ length: MIN_SAMPLE }, (_, i) => [`yt-v${i}`, { views: 100 * (i + 1), source: "public" as const }]));
    await collectChannelSnapshots(db, "chan-a", config, { analytics: vi.fn().mockResolvedValue({ status: "ok", metrics: new Map() }), publicStats: vi.fn().mockResolvedValue({ status: "ok", metrics: views }), now });

    const feedback = await getChannelFeedback(config, db, now);
    expect(feedback).toMatchObject({ window: "72h", sampleSize: MIN_SAMPLE, medianViews: 400 });
    expect(feedback!.topTitles[0]).toContain("Título v7");
    expect(formatFeedbackForPrompt(feedback)).toContain("mesma idade: 72h");
    expect(await getChannelFeedback({ ...config, managedRun: { ...config.managedRun, channelId: "chan-b" } }, db, now)).toBeNull();
    expect(await getChannelFeedback(config, null, now)).toBeNull();
    expect(formatFeedbackForPrompt(null)).toBe("");
  });
});

describe("helpers", () => {
  it("classifies API errors", () => {
    expect(classifyMetricsError({ code: 403, message: "Insufficient Permission" }).status).toBe("no_permission");
    expect(classifyMetricsError({ response: { status: 429 }, message: "x" }).status).toBe("quota");
    expect(classifyMetricsError(new Error("socket hang up")).status).toBe("error");
  });

  it("resolves handles", () => {
    expect(resolveChannelHandle({ channelHandle: "abc" } as any)).toBe("@abc");
    expect(resolveChannelHandle({ managedRun: { channelId: "akitemquiz" } } as any)).toBe("@akitemquiz");
    expect(resolveChannelHandle({} as any)).toBeNull();
  });
});
