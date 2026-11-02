import { beforeEach, describe, expect, it, vi } from "vitest";
import { selectClips } from "../../src/core/analyzer-select.js";
import * as quality from "../../src/core/clip-quality.js";
import * as repair from "../../src/core/clip-repair.js";
import type { PipelineConfig, Transcript } from "../../src/types.js";

vi.mock("../../src/core/clip-quality.js", () => ({ reviewClipOutcome: vi.fn() }));
vi.mock("../../src/core/clip-repair.js", () => ({ repairClipCandidates: vi.fn() }));

const transcript = {
  videoId: "v", duration: 300, language: "pt", fullText: "", words: [],
  segments: [{ start: 0, end: 40, text: "Primeira ideia." }, { start: 200, end: 240, text: "Segunda ideia." }],
} as Transcript;
const config = { minShortDuration: 15, maxShortDuration: 59 } as PipelineConfig;
const clip = (title: string, startTime: number, endTime: number) =>
  ({ title, description: "", startTime, endTime, viralScore: 9, reason: "", hashtags: [] });
const outcome = (approved: ReturnType<typeof clip>[], rejected: ReturnType<typeof clip>[], status: "ok" | "unavailable" = "ok") =>
  ({ approved, rejected, status, reasons: rejected.map((item) => ({ title: item.title, reason: "ruim" })) });

describe("selectClips", () => {
  beforeEach(() => vi.resetAllMocks());

  it("rediscovers in unexplored gaps when rejects exist and room remains", async () => {
    const good = clip("Boa", 0, 40);
    const bad = clip("Ruim", 100, 130);
    const found = clip("Nova", 200, 240);
    vi.mocked(quality.reviewClipOutcome)
      .mockResolvedValueOnce(outcome([good], [bad]))
      .mockResolvedValueOnce(outcome([found], []));
    vi.mocked(repair.repairClipCandidates).mockResolvedValue([found]);

    const result = await selectClips([good, bad], transcript, config, 3, 6);

    expect(result.clips.map((item) => item.title)).toEqual(["Boa", "Nova"]);
    expect(result.trail).toMatchObject({ proposed: 2, approved: 2, rediscovered: 1, reviewer: "ok" });
    const context = vi.mocked(repair.repairClipCandidates).mock.calls[0]![4]!;
    expect(context.exclude).toHaveLength(1);
    expect(context.gaps!.length).toBeGreaterThan(0);
  });

  it("skips rediscovery when capacity is full or nothing was rejected", async () => {
    const good = clip("Boa", 0, 40);
    vi.mocked(quality.reviewClipOutcome).mockResolvedValue(outcome([good], [clip("Ruim", 100, 130)]));
    expect((await selectClips([good], transcript, config, 1, 6)).clips).toHaveLength(1);
    vi.mocked(quality.reviewClipOutcome).mockResolvedValue(outcome([good], []));
    await selectClips([good], transcript, config, 3, 6);
    expect(repair.repairClipCandidates).not.toHaveBeenCalled();
  });

  it("never repairs when the reviewer is offline", async () => {
    const bad = clip("Ruim", 100, 130);
    vi.mocked(quality.reviewClipOutcome).mockResolvedValue(outcome([], [bad], "unavailable"));
    const result = await selectClips([bad], transcript, config, 3, 6);
    expect(result.clips).toEqual([]);
    expect(result.trail.reviewer).toBe("unavailable");
    expect(repair.repairClipCandidates).not.toHaveBeenCalled();
  });

  it("repairs the whole pool when approvals were all unusable", async () => {
    const tooLong = clip("Longa", 0, 80);
    vi.mocked(quality.reviewClipOutcome).mockResolvedValue(outcome([tooLong], []));
    vi.mocked(repair.repairClipCandidates).mockResolvedValue([]);
    await selectClips([tooLong], transcript, config, 3, 6, null);
    expect(vi.mocked(repair.repairClipCandidates).mock.calls[0]![0]).toHaveLength(1);
  });
});
