import { describe, it, expect, vi, beforeEach } from "vitest";
import { analyzeTranscript } from "../../src/core/analyzer.js";
import type { Transcript, PipelineConfig } from "../../src/types.js";
import * as aiModule from "ai";

vi.mock("ai", () => ({
  generateText: vi.fn(),
}));

describe("analyzer", () => {
  const mockConfig: PipelineConfig = {
    minShortDuration: 15,
    maxShortDuration: 60,
    ollamaModel: "qwen3-vl:4b",
    minuteBlockSize: 20,
    maxCutsPerBlock: 10,
  } as PipelineConfig;

  const mockTranscript: Transcript = {
    videoId: "vid1",
    duration: 120, // 2 minutes
    segments: [
      { start: 0, end: 10, text: "Intro" },
      { start: 10, end: 40, text: "Main point" },
      { start: 40, end: 120, text: "Outro" },
    ],
    words: [],
    fullText: "Intro Main point Outro",
    language: "pt",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should process valid JSON from LLM successfully", async () => {
    // 2 minutes duration -> minCuts = 4, maxCuts = 2 -> target = 4.
    const mockResponse = {
      clips: [
        {
          title: "Clip 1",
          description: "Desc",
          startTime: 10,
          endTime: 40,
          viralScore: 9,
          reason: "Reason",
          hookLine: "Hook",
          hashtags: ["#test"],
        },
      ],
    };

    vi.mocked(aiModule.generateText).mockResolvedValue({
      text: JSON.stringify(mockResponse),
    } as any);

    const clips = await analyzeTranscript(mockTranscript, "Title", "Channel", mockConfig);

    expect(clips).toHaveLength(1);
    expect(clips[0].title).toBe("Clip 1");
    expect(clips[0].duration).toBe(30);
  });

  it("should retry if LLM returns invalid JSON", async () => {
    const mockResponse = {
      clips: [
        {
          title: "Clip 1",
          description: "Desc",
          startTime: 10,
          endTime: 40,
          viralScore: 9,
          reason: "Reason",
          hookLine: "Hook",
          hashtags: ["#test"],
        },
      ],
    };

    // First call returns garbage
    vi.mocked(aiModule.generateText)
      .mockResolvedValueOnce({ text: "Garbage data" } as any)
      .mockResolvedValueOnce({ text: JSON.stringify(mockResponse) } as any);

    const clips = await analyzeTranscript(mockTranscript, "Title", "Channel", mockConfig);

    expect(aiModule.generateText).toHaveBeenCalledTimes(2);
    expect(clips).toHaveLength(1);
  });

  it("should parse JSON enclosed in markdown blocks", async () => {
    const mockResponse = {
      clips: [
        {
          title: "Clip 1",
          description: "Desc",
          startTime: 10,
          endTime: 40,
          viralScore: 9,
          reason: "Reason",
          hookLine: "Hook",
          hashtags: ["#test"],
        },
      ],
    };

    vi.mocked(aiModule.generateText).mockResolvedValue({
      text: `\`\`\`json\n${JSON.stringify(mockResponse)}\n\`\`\``,
    } as any);

    const clips = await analyzeTranscript(mockTranscript, "Title", "Channel", mockConfig);
    expect(clips).toHaveLength(1);
  });
});
