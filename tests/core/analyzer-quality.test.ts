import { beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeTranscript } from "../../src/core/analyzer.js";
import * as gjModule from "../../src/core/generate-json.js";
import type { PipelineConfig, Transcript } from "../../src/types.js";

vi.mock("ai", () => ({ generateText: vi.fn() }));
vi.mock("../../src/core/generate-json.js", () => ({ generateJsonObject: vi.fn() }));
vi.mock("../../src/core/ai-provider.js", () => ({
  createModel: vi.fn().mockReturnValue({ id: "mock-model" }),
}));

describe("analyzer editorial gate", () => {
  beforeEach(() => vi.mocked(gjModule.generateJsonObject).mockReset());

  it("does not publish a candidate rejected by the independent editorial pass", async () => {
    vi.mocked(gjModule.generateJsonObject)
      .mockResolvedValueOnce({
        clips: [{
          title: "A história que pode mudar sua disciplina hoje",
          presenter: "",
          description: "Desc",
          contentValue: "Reflexão",
          startTime: 0,
          endTime: 40,
          viralScore: 10,
          reason: "Primeiro editor aprovou",
          hashtags: ["#disciplina"],
        }],
      } as never)
      .mockResolvedValueOnce({
        reviews: [{
          candidateIndex: 0,
          editorialScore: 5,
          hookScore: 4,
          standaloneScore: 8,
          payoffScore: 8,
          approved: false,
          reason: "Começa com introdução.",
        }],
      } as never)
      .mockResolvedValueOnce({ clips: [] } as never);

    const transcript: Transcript = {
      videoId: "video-1",
      duration: 90,
      language: "pt",
      fullText: "",
      words: [],
      segments: [
        { start: 0, end: 10, text: "Olá pessoal, hoje eu quero falar." },
        { start: 10, end: 40, text: "A disciplina vence a motivação." },
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

    expect(clips).toEqual([]);
    expect(gjModule.generateJsonObject).toHaveBeenCalledTimes(3);
  });

  it("repairs invalid boundaries and re-reviews the replacement before publishing", async () => {
    const candidate = {
      title: "A verdade que cura o ego",
      presenter: "Frei Gilson",
      description: "Desc",
      contentValue: "Reflexão",
      hookText: "A palavra deve ser pregada.",
      payoffText: "Pref...",
      startTime: 0,
      endTime: 80,
      viralScore: 9,
      reason: "Tema forte",
      hashtags: ["#evangelho"],
    };
    const approvedReview = {
      candidateIndex: 0,
      editorialScore: 9,
      hookScore: 9,
      standaloneScore: 9,
      payoffScore: 9,
      approved: true,
      reason: "Aprovado.",
    };
    vi.mocked(gjModule.generateJsonObject)
      .mockResolvedValueOnce({ clips: [candidate] } as never)
      .mockResolvedValueOnce({ reviews: [approvedReview] } as never)
      .mockResolvedValueOnce({
        clips: [{
          ...candidate,
          hookText: "A verdade muitas vezes vai doer.",
          payoffText: "Ele fere para curar.",
          startTime: 20,
          endTime: 40,
        }],
      } as never)
      .mockResolvedValueOnce({ reviews: [approvedReview] } as never);
    const transcript: Transcript = {
      videoId: "video-2",
      duration: 90,
      language: "pt",
      fullText: "",
      words: [],
      segments: [
        { start: 0, end: 20, text: "Introdução longa." },
        { start: 20, end: 30, text: "A verdade muitas vezes vai doer." },
        { start: 30, end: 40, text: "Ela liberta. Ele fere para curar." },
        { start: 40, end: 90, text: "Encerramento." },
      ],
    };
    const config = {
      minShortDuration: 15,
      maxShortDuration: 59,
      minViralScore: 7,
      aiTimeoutMs: 300_000,
      aiModel: "mock",
      maxClipsOverride: 1,
    } as PipelineConfig;

    const clips = await analyzeTranscript(transcript, "Title", "Channel", config);

    expect(clips).toHaveLength(1);
    expect(clips[0]).toMatchObject({ startTime: 20, viralScore: 9 });
    expect(clips[0].endTime).toBeCloseTo(40.6);
    expect(gjModule.generateJsonObject).toHaveBeenCalledTimes(4);
  });
});
