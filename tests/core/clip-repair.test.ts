import { beforeEach, describe, expect, it, vi } from "vitest";
import { repairClipCandidates } from "../../src/core/clip-repair.js";
import * as gjModule from "../../src/core/generate-json.js";
import type { PipelineConfig, Transcript } from "../../src/types.js";

vi.mock("../../src/core/generate-json.js", () => ({ generateJsonObject: vi.fn() }));
vi.mock("../../src/core/ai-provider.js", () => ({
  createModel: vi.fn(() => ({ id: "mock" })),
}));

const transcript = {
  videoId: "repair",
  duration: 40,
  language: "pt",
  fullText: "A verdade liberta.",
  words: [],
  segments: [{ start: 0, end: 20, text: "A verdade liberta." }],
} as Transcript;
const clip = {
  title: "Corte",
  startTime: 0,
  endTime: 20,
  viralScore: 8,
  description: "D",
  reason: "R",
  hashtags: [],
};
const config = { minShortDuration: 15, maxShortDuration: 59 } as PipelineConfig;

describe("clip repair", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns immediately without candidates", async () => {
    await expect(repairClipCandidates([], transcript, config, 1)).resolves.toEqual([]);
    expect(gjModule.generateJsonObject).not.toHaveBeenCalled();
  });

  it("accepts an empty structured repair response", async () => {
    vi.mocked(gjModule.generateJsonObject).mockResolvedValue({} as never);
    await expect(repairClipCandidates([clip], transcript, config, 1)).resolves.toEqual([]);
  });

  it("fails closed when repair generation fails", async () => {
    vi.mocked(gjModule.generateJsonObject).mockRejectedValue(new Error("offline"));
    await expect(repairClipCandidates([clip], transcript, config, 1)).resolves.toEqual([]);
  });
});
