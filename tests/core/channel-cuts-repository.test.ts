import { describe, it, expect, vi } from "vitest";
import { ChannelCutsRepository } from "../../src/core/channel-cuts-repository.js";
import { ChannelScheduleRepository } from "../../src/core/channel-schedule-repository.js";
import { ChannelAnalysisRepository } from "../../src/core/channel-analysis-repository.js";

const fakeDb = (rows: unknown[] = [], rowCount = 1) => ({
  query: vi.fn().mockResolvedValue({ rows, rowCount }),
});

describe("ChannelCutsRepository", () => {
  it("maps rows to camelCase and numeric seconds", async () => {
    const db = fakeDb([{ id: "c1", channel_id: "ch", source_video_id: "v", title: "t", start_sec: "1.5", end_sec: 9, created_at: "x" }]);
    const cuts = await new ChannelCutsRepository(db).listCuts("ch");
    expect(cuts).toEqual([{ id: "c1", channelId: "ch", sourceVideoId: "v", title: "t", startSec: 1.5, endSec: 9, createdAt: "x" }]);
  });

  it("inserts and deletes scoped to the channel", async () => {
    const db = fakeDb([], 0);
    const repo = new ChannelCutsRepository(db);
    await repo.addCut({ id: "c1", channelId: "ch", sourceVideoId: "v", title: "t", startSec: 0, endSec: 5, createdAt: "x" });
    expect(db.query.mock.calls[0][1]).toEqual(["c1", "ch", "v", "t", 0, 5, "x"]);
    expect(await repo.deleteCut("ch", "c1")).toBe(false);
  });

  it("treats a missing rowCount as no deletion", async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    expect(await new ChannelCutsRepository(db).deleteCut("ch", "c1")).toBe(false);
  });
});

describe("ChannelScheduleRepository", () => {
  it("lists entries inside the window", async () => {
    const db = fakeDb([{ id: "e", channel_id: "ch", cut_id: null, kind: "programmed", run_at: "t", created_at: "c" }]);
    const entries = await new ChannelScheduleRepository(db).listEntries("ch", "a", "b");
    expect(entries[0]).toEqual({ id: "e", channelId: "ch", cutId: null, kind: "programmed", runAt: "t", createdAt: "c" });
    expect(db.query.mock.calls[0][1]).toEqual(["ch", "a", "b"]);
  });

  it("adds and deletes entries", async () => {
    const db = fakeDb([], 1);
    const repo = new ChannelScheduleRepository(db);
    await repo.addEntry({ id: "e", channelId: "ch", cutId: "c1", kind: "manual", runAt: "t", createdAt: "c" });
    expect(await repo.deleteEntry("ch", "e")).toBe(true);
  });

  it("treats a missing rowCount as no deletion", async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    expect(await new ChannelScheduleRepository(db).deleteEntry("ch", "e")).toBe(false);
  });
});

describe("ChannelAnalysisRepository", () => {
  const payload = { energy: [0.5], replay: [1], speakerLanes: [], suggestions: [] };

  it("returns null when no analysis is stored", async () => {
    expect(await new ChannelAnalysisRepository(fakeDb([])).getAnalysis("ch", "v")).toBeNull();
  });

  it("maps a stored analysis row", async () => {
    const db = fakeDb([{ channel_id: "ch", source_video_id: "v", duration_sec: "2538", analysis: payload, created_at: "c" }]);
    const found = await new ChannelAnalysisRepository(db).getAnalysis("ch", "v");
    expect(found).toEqual({ channelId: "ch", sourceVideoId: "v", durationSec: 2538, analysis: payload, createdAt: "c" });
  });

  it("saves analysis as JSON with upsert", async () => {
    const db = fakeDb();
    await new ChannelAnalysisRepository(db).saveAnalysis({ channelId: "ch", sourceVideoId: "v", durationSec: 60, analysis: payload, createdAt: "c" });
    expect(db.query.mock.calls[0][0]).toContain("ON CONFLICT");
    expect(db.query.mock.calls[0][1][3]).toBe(JSON.stringify(payload));
  });
});
