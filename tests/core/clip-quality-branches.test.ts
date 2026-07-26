import { beforeEach, describe, expect, it, vi } from "vitest";
import { reviewClipCandidates } from "../../src/core/clip-quality.js";
import * as gjModule from "../../src/core/generate-json.js";
import type { PipelineConfig, Transcript } from "../../src/types.js";

vi.mock("../../src/core/generate-json.js", () => ({ generateJsonObject: vi.fn() }));
vi.mock("../../src/core/ai-provider.js", () => ({
  createModel: vi.fn(() => ({ id: "mock" })),
}));

const transcript = {
  videoId: "quality",
  duration: 30,
  language: "pt",
  fullText: "",
  words: [],
  segments: [
    { start: 0, end: 10, text: "Começo comum." },
    { start: 10, end: 20, text: "Final comum." },
  ],
} as Transcript;
const clip = {
  title: "Corte",
  description: "D",
  startTime: 0,
  endTime: 20,
  viralScore: 8,
  reason: "R",
  hashtags: [],
};
const config = { minShortDuration: 15, maxShortDuration: 59 } as PipelineConfig;

describe("clip quality branches", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns before invoking AI for an empty pool", async () => {
    await expect(reviewClipCandidates([], transcript, config)).resolves.toEqual([]);
  });

  it("rejects candidates omitted from the editorial response", async () => {
    vi.mocked(gjModule.generateJsonObject).mockResolvedValue({ reviews: [] } as never);
    await expect(reviewClipCandidates([clip], transcript, config)).resolves.toEqual([]);
  });

  it("uses default thresholds and accepts a complete review", async () => {
    vi.mocked(gjModule.generateJsonObject).mockResolvedValue({
      reviews: [{
        candidateIndex: 0,
        editorialScore: 7,
        hookScore: 7,
        standaloneScore: 7,
        payoffScore: 7,
        approved: true,
        reason: "Aprovado.",
      }],
    } as never);
    const result = await reviewClipCandidates([clip], transcript, config);
    expect(result[0]).toMatchObject({ viralScore: 7, reason: "Aprovado." });
  });
});
