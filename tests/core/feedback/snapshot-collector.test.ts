import { describe, it, expect, vi, beforeEach } from "vitest";
import { collectChannelSnapshots, clearMetricsCache } from "../../../src/core/feedback/snapshot-collector.js";
import type { MetricsResult, MetricsSource } from "../../../src/core/feedback/metrics-sources.js";

const { mockPublishedForCollection, mockInsert, mockDefaultAnalytics, mockDefaultPublic } = vi.hoisted(() => ({
  mockPublishedForCollection: vi.fn(),
  mockInsert: vi.fn(),
  mockDefaultAnalytics: vi.fn(),
  mockDefaultPublic: vi.fn(),
}));

vi.mock("../../../src/core/feedback/snapshot-repository.js", () => ({
  SnapshotRepository: class {
    publishedForCollection = mockPublishedForCollection;
    insert = mockInsert;
  },
}));

vi.mock("../../../src/core/feedback/metrics-sources.js", () => ({
  analyticsSource: mockDefaultAnalytics,
  publicSource: mockDefaultPublic,
}));

const db = {} as any;
const config = {} as any;
const video = { publicationId: "p1", youtubeVideoId: "v1", title: "T", format: "cuts", theme: null, publishedAt: "2026-09-01T00:00:00Z" };

const okResult = (entries: [string, any][]): MetricsResult => ({ status: "ok", metrics: new Map(entries) });
const failResult = (status: MetricsResult["status"]): MetricsResult => ({ status, error: "nope" }) as MetricsResult;

describe("collectChannelSnapshots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMetricsCache();
  });

  it("skips collection when there are no candidate videos", async () => {
    mockPublishedForCollection.mockResolvedValue([]);
    const report = await collectChannelSnapshots(db, "chan-a", config);
    expect(report).toEqual({ channelId: "chan-a", candidates: 0, collected: 0, source: "none", analyticsStatus: "skipped", publicStatus: "skipped" });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("uses analytics metrics when available", async () => {
    mockPublishedForCollection.mockResolvedValue([video]);
    const analytics: MetricsSource = vi.fn().mockResolvedValue(okResult([["v1", { views: 10, source: "analytics" }]]));
    const report = await collectChannelSnapshots(db, "chan-a", config, { analytics });
    expect(report.source).toBe("analytics");
    expect(report.collected).toBe(1);
    expect(mockInsert).toHaveBeenCalledWith("chan-a", video, expect.any(Date), { views: 10, source: "analytics" });
  });

  it("falls back to public metrics when analytics is unavailable", async () => {
    mockPublishedForCollection.mockResolvedValue([video]);
    const analytics: MetricsSource = vi.fn().mockResolvedValue(failResult("no_permission"));
    const publicStats: MetricsSource = vi.fn().mockResolvedValue(okResult([["v1", { views: 5, source: "public" }]]));
    const report = await collectChannelSnapshots(db, "chan-a", config, { analytics, publicStats });
    expect(report.source).toBe("public");
    expect(report.analyticsStatus).toBe("no_permission");
    expect(report.collected).toBe(1);
  });

  it("falls back to public metrics when analytics returns an empty map", async () => {
    mockPublishedForCollection.mockResolvedValue([video]);
    const analytics: MetricsSource = vi.fn().mockResolvedValue(okResult([]));
    const publicStats: MetricsSource = vi.fn().mockResolvedValue(okResult([["v1", { views: 5, source: "public" }]]));
    const report = await collectChannelSnapshots(db, "chan-a", config, { analytics, publicStats });
    expect(report.source).toBe("public");
    expect(publicStats).toHaveBeenCalled();
  });

  it("reports source none when both sources fail", async () => {
    mockPublishedForCollection.mockResolvedValue([video]);
    const analytics: MetricsSource = vi.fn().mockResolvedValue(failResult("error"));
    const publicStats: MetricsSource = vi.fn().mockResolvedValue(failResult("error"));
    const report = await collectChannelSnapshots(db, "chan-a", config, { analytics, publicStats });
    expect(report).toMatchObject({ collected: 0, source: "none" });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("skips a candidate video missing from the metrics map", async () => {
    mockPublishedForCollection.mockResolvedValue([video, { ...video, youtubeVideoId: "v2" }]);
    const analytics: MetricsSource = vi.fn().mockResolvedValue(okResult([["v1", { views: 10, source: "analytics" }]]));
    const report = await collectChannelSnapshots(db, "chan-a", config, { analytics });
    expect(report.collected).toBe(1);
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("caches analytics answers per channel+id set within the TTL", async () => {
    mockPublishedForCollection.mockResolvedValue([video]);
    const analytics: MetricsSource = vi.fn().mockResolvedValue(okResult([["v1", { views: 1, source: "analytics" }]]));
    const now = new Date("2026-09-10T00:00:00Z");
    await collectChannelSnapshots(db, "chan-a", config, { analytics, now });
    await collectChannelSnapshots(db, "chan-a", config, { analytics, now: new Date(now.getTime() + 60_000) });
    expect(analytics).toHaveBeenCalledTimes(1);
  });

  it("re-queries analytics once the cache TTL has expired", async () => {
    mockPublishedForCollection.mockResolvedValue([video]);
    const analytics: MetricsSource = vi.fn().mockResolvedValue(okResult([["v1", { views: 1, source: "analytics" }]]));
    const now = new Date("2026-09-10T00:00:00Z");
    await collectChannelSnapshots(db, "chan-a", config, { analytics, now });
    await collectChannelSnapshots(db, "chan-a", config, { analytics, now: new Date(now.getTime() + 61 * 60_000) });
    expect(analytics).toHaveBeenCalledTimes(2);
  });

  it("keeps a still-fresh cache entry for a different channel while pruning", async () => {
    mockPublishedForCollection.mockResolvedValue([video]);
    const analytics: MetricsSource = vi.fn().mockResolvedValue(okResult([["v1", { views: 1, source: "analytics" }]]));
    const now = new Date("2026-09-10T00:00:00Z");
    await collectChannelSnapshots(db, "chan-a", config, { analytics, now });
    await collectChannelSnapshots(db, "chan-b", config, { analytics, now: new Date(now.getTime() + 60_000) });
    // Both entries still within TTL: neither call re-queried a cached channel.
    expect(analytics).toHaveBeenCalledTimes(2);
  });

  it("falls back to the real metrics-sources module when no deps are injected", async () => {
    mockPublishedForCollection.mockResolvedValue([video]);
    mockDefaultAnalytics.mockResolvedValue(okResult([["v1", { views: 42, source: "analytics" }]]));
    const report = await collectChannelSnapshots(db, "chan-default", config);
    expect(mockDefaultAnalytics).toHaveBeenCalled();
    expect(report.collected).toBe(1);
  });

  it("falls back to the real public source module when no publicStats dep is injected", async () => {
    mockPublishedForCollection.mockResolvedValue([video]);
    mockDefaultAnalytics.mockResolvedValue(failResult("error"));
    mockDefaultPublic.mockResolvedValue(okResult([["v1", { views: 7, source: "public" }]]));
    const report = await collectChannelSnapshots(db, "chan-default-2", config);
    expect(mockDefaultPublic).toHaveBeenCalled();
    expect(report.source).toBe("public");
  });
});
