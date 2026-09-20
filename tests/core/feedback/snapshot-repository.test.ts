import { describe, it, expect, vi } from "vitest";
import { SnapshotRepository } from "../../../src/core/feedback/snapshot-repository.js";

const mockQueryRows = vi.hoisted(() => vi.fn());
vi.mock("../../../src/core/control-plane-db.js", () => ({ queryRows: mockQueryRows }));

describe("SnapshotRepository.publishedForCollection", () => {
  it("maps published clip rows and clamps the limit", async () => {
    mockQueryRows.mockResolvedValue([
      { id: "pub1", youtube_video_id: "v1", title: "T1", format: "cuts", theme: null, published_at: "2026-09-01T00:00:00Z" },
      { id: "pub2", youtube_video_id: "v2", title: "T2", format: "cuts", theme: "faith", published_at: "2026-09-02T00:00:00Z" },
    ]);
    const repo = new SnapshotRepository({} as any);
    const now = new Date("2026-09-10T00:00:00Z");

    const result = await repo.publishedForCollection("chan-a", now, 8, 900);

    expect(result).toEqual([
      { publicationId: "pub1", youtubeVideoId: "v1", title: "T1", format: "cuts", theme: null, publishedAt: "2026-09-01T00:00:00Z" },
      { publicationId: "pub2", youtubeVideoId: "v2", title: "T2", format: "cuts", theme: "faith", publishedAt: "2026-09-02T00:00:00Z" },
    ]);
    const [, sql, params] = mockQueryRows.mock.calls[0]!;
    expect(sql).toContain("LIMIT 500"); // clamped from the requested 900
    expect(params).toEqual(["chan-a", new Date(now.getTime() - 8 * 86_400_000).toISOString()]);
  });
});

describe("SnapshotRepository.dailySeries", () => {
  it("defaults null aggregates to zero", async () => {
    mockQueryRows.mockResolvedValue([{ day: "2026-09-10", total_views: null, avg_pct: null, videos: null }]);
    const repo = new SnapshotRepository({} as any);
    const result = await repo.dailySeries("chan-a", new Date("2026-09-10T00:00:00Z"));
    expect(result).toEqual([{ day: "2026-09-10", totalViews: 0, avgViewPercentage: null, videoCount: 0 }]);
  });
});
