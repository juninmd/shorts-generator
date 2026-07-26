import { beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeTranscript } from "../../src/core/analyzer.js";
import * as gjModule from "../../src/core/generate-json.js";
import type { PipelineConfig, Transcript } from "../../src/types.js";

vi.mock("ai", () => ({ generateText: vi.fn() }));
vi.mock("../../src/core/generate-json.js", () => ({ generateJsonObject: vi.fn() }));
vi.mock("../../src/core/ai-provider.js", () => ({
  createModel: vi.fn().mockReturnValue({ id: "mock-model" }),
}));

describe("analyzer candidate pool", () => {
  beforeEach(() => vi.mocked(gjModule.generateJsonObject).mockReset());

  it("keeps a strong final-third discovery when the LLM fills its candidate quota", async () => {
    const rawCandidates = [0, 60, 120, 180, 240, 300].map((start, index) => ({
      title: `Candidate ${index}`,
      description: "Median candidate",
      contentValue: "Generic",
      startTime: start,
      endTime: start + 15,
      viralScore: 10,
      reason: "LLM candidate",
      hashtags: [],
    }));
    vi.mocked(gjModule.generateJsonObject)
      .mockResolvedValueOnce({ clips: rawCandidates } as never)
      .mockResolvedValueOnce({
        reviews: [{
          candidateIndex: 6,
          editorialScore: 9,
          hookScore: 9,
          standaloneScore: 9,
          payoffScore: 9,
          approved: true,
          reason: "Strong final payoff.",
        }],
      } as never)
      .mockResolvedValueOnce({ clips: [] } as never);
    const transcript: Transcript = {
      videoId: "full-scan",
      duration: 420,
      language: "pt",
      fullText: "",
      words: [],
      segments: [
        ...rawCandidates.flatMap((clip) => [
          { start: clip.startTime, end: clip.startTime + 7, text: "Generic context." },
          { start: clip.startTime + 7, end: clip.endTime, text: "Generic ending." },
        ]),
        { start: 389, end: 398, text: "A verdade vai doer, mas vai libertar e salvar." },
        { start: 399, end: 404, text: "Não tenha medo. Ele fere para curar." },
      ],
    };
    const config = {
      minShortDuration: 15,
      maxShortDuration: 59,
      minViralScore: 7,
      aiTimeoutMs: 300_000,
      aiModel: "mock",
    } as PipelineConfig;

    const clips = await analyzeTranscript(transcript, "Title", "Channel", config);

    expect(clips).toHaveLength(1);
    expect(clips[0]).toMatchObject({ startTime: 389 });
    expect(clips[0].endTime).toBeCloseTo(404.6);
  });
});
