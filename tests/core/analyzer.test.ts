import { describe, it, expect, vi, beforeEach } from "vitest";
import { analyzeTranscript } from "../../src/core/analyzer.js";
import type { Transcript, PipelineConfig } from "../../src/types.js";
import * as aiModule from "ai";
import * as undiciModule from "undici";

vi.mock("ai", () => ({
  generateText: vi.fn(),
}));

vi.mock("undici", () => ({
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  Agent: vi.fn(function AgentMock() {}),
  fetch: vi.fn(),
}));

vi.mock("ollama-ai-provider", () => ({
  createOllama: vi.fn().mockReturnValue(
    vi.fn().mockReturnValue({ id: "mock-model" }),
  ),
}));

describe("analyzer", () => {
  const mockConfig: PipelineConfig = {
    minShortDuration: 15,
    maxShortDuration: 60,
    ollamaModel: "qwen3-vl:4b",
    ollamaBaseUrl: "http://localhost:11434",
    ollamaTimeoutMs: 300_000,
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

  it("should create an undici Agent with the configured ollamaTimeoutMs", async () => {
    const customConfig: PipelineConfig = {
      ...mockConfig,
      ollamaTimeoutMs: 600_000,
    };

    vi.mocked(aiModule.generateText).mockResolvedValue({ text: '{"clips":[]}' } as any);

    await analyzeTranscript(mockTranscript, "Title", "Channel", customConfig);

    expect(undiciModule.Agent).toHaveBeenCalledWith(
      expect.objectContaining({
        headersTimeout: 600_000,
        bodyTimeout: 600_000,
      }),
    );
  });

  it("should use default ollamaTimeoutMs of 300_000 when not overridden", async () => {
    vi.mocked(aiModule.generateText).mockResolvedValue({ text: '{"clips":[]}' } as any);

    await analyzeTranscript(mockTranscript, "Title", "Channel", mockConfig);

    expect(undiciModule.Agent).toHaveBeenCalledWith(
      expect.objectContaining({
        headersTimeout: 300_000,
        bodyTimeout: 300_000,
      }),
    );
  });

  it("should return empty array when LLM fails after retry", async () => {
    vi.mocked(aiModule.generateText).mockResolvedValue({ text: "not json" } as any);

    const clips = await analyzeTranscript(mockTranscript, "Title", "Channel", mockConfig);

    expect(aiModule.generateText).toHaveBeenCalledTimes(2);
    expect(clips).toHaveLength(0);
  });
});
