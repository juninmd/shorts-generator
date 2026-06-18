import { describe, it, expect, vi, beforeEach } from "vitest";
import { analyzeTranscript } from "../../src/core/analyzer.js";
import type { Transcript, PipelineConfig } from "../../src/types.js";
import * as aiModule from "ai";

vi.mock("ai", () => ({
  generateText: vi.fn(),
  generateObject: vi.fn(),
}));

vi.mock("../../src/core/ai-provider.js", () => ({
  createModel: vi.fn().mockReturnValue({ id: "mock-model" }),
}));

describe("analyzer", () => {
  const mockConfig: PipelineConfig = {
    minShortDuration: 15,
    maxShortDuration: 59,
    aiProvider: "ollama",
    aiModel: "gemma3:1b",
    aiTimeoutMs: 300_000,
    openrouterApiKey: "",
    ollamaBaseUrl: "http://localhost:11434",
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

  it("should process valid response from LLM successfully", async () => {
    const mockResponse = {
      clips: [
        {
          title: "Clip 1",
          description: "Desc",
          startTime: 10,
          endTime: 40,
          viralScore: 9,
          reason: "Reason",
          hashtags: ["#test"],
        },
      ],
    };

    vi.mocked(aiModule.generateObject).mockResolvedValue({
      object: mockResponse,
    } as any);

    const clips = await analyzeTranscript(mockTranscript, "Title", "Channel", mockConfig);

    expect(clips).toHaveLength(1);
    expect(clips[0].title).toBe("Clip 1");
    expect(clips[0].duration).toBe(30);
    const prompt = vi.mocked(aiModule.generateObject).mock.calls[0]?.[0].prompt;
    expect(prompt).toContain("Voc\u00ea \u00e9");
    expect(prompt).toContain("conte\u00fado");
    expect(prompt).not.toMatch(new RegExp("[\\u00f0\\u0178\\u00e2\\u20ac]"));
  });

  it("should return empty array when LLM fails", async () => {
    vi.mocked(aiModule.generateObject).mockRejectedValue(new Error("AI Error"));
    vi.mocked(aiModule.generateText).mockRejectedValue(new Error("AI Fallback Error"));

    const clips = await analyzeTranscript(mockTranscript, "Title", "Channel", mockConfig);

    expect(clips).toHaveLength(0);
  });

  it("should sort clips by viralScore in descending order", async () => {
    const mockResponse = {
      clips: [
        {
          title: "Clip 1",
          description: "Desc",
          startTime: 10,
          endTime: 40,
          viralScore: 5,
          reason: "Reason",
          hashtags: ["#test"],
        },
        {
          title: "Clip 2",
          description: "Desc",
          startTime: 40,
          endTime: 70,
          viralScore: 9,
          reason: "Reason",
          hashtags: ["#test"],
        },
      ],
    };

    vi.mocked(aiModule.generateObject).mockResolvedValue({
      object: mockResponse,
    } as any);

    const clips = await analyzeTranscript(mockTranscript, "Title", "Channel", mockConfig);
    expect(clips).toHaveLength(2);
    expect(clips[0].title).toBe("Clip 2");
    expect(clips[1].title).toBe("Clip 1");
  });

  it("should filter out clips that do not meet minDuration or maxDuration or start/endTime limits", async () => {
    const mockResponse = {
      clips: [
        {
          title: "Too Short",
          description: "Desc",
          startTime: 10,
          endTime: 15, // duration 5 < minShortDuration 15
          viralScore: 9,
          reason: "Reason",
          hashtags: ["#test"],
        },
        {
          title: "Too Long",
          description: "Desc",
          startTime: 10,
          endTime: 90, // duration 80 > maxShortDuration 59
          viralScore: 9,
          reason: "Reason",
          hashtags: ["#test"],
        },
        {
          title: "Invalid Times",
          description: "Desc",
          startTime: -10, // < 0
          endTime: 130, // > transcript.duration 120
          viralScore: 9,
          reason: "Reason",
          hashtags: ["#test"],
        },
        {
          title: "Valid",
          description: "Desc",
          startTime: 40,
          endTime: 70, // duration 30
          viralScore: 8,
          reason: "Reason",
          hashtags: ["#test"],
        },
      ],
    };

    vi.mocked(aiModule.generateObject).mockResolvedValue({
      object: mockResponse,
    } as any);

    const clips = await analyzeTranscript(mockTranscript, "Title", "Channel", mockConfig);

    expect(clips).toHaveLength(1);
    expect(clips[0].title).toBe("Valid");
  });

  it("should return empty array if AI returns empty clips list", async () => {
    vi.mocked(aiModule.generateObject).mockResolvedValue({
      object: { clips: [] },
    } as any);

    const clips = await analyzeTranscript(mockTranscript, "Title", "Channel", mockConfig);
    expect(clips).toHaveLength(0);
  });

  it("should return empty array if AI resolves without clips array", async () => {
    vi.mocked(aiModule.generateObject).mockResolvedValue({
      object: {}, // missing clips
    } as any);

    const clips = await analyzeTranscript(mockTranscript, "Title", "Channel", mockConfig);
    expect(clips).toHaveLength(0);
  });

  it("should analyze in chunks if formatted transcript length exceeds CHUNK_THRESHOLD_CHARS", async () => {
    const largeSegments = Array.from({ length: 600 }).map((_, i) => ({
      start: i * 2,
      end: i * 2 + 2,
      text: "A very long sentence here to fill up the chunk threshold limit quickly ".repeat(3)
    }));

    const largeTranscript: Transcript = {
      videoId: "vid1",
      duration: 1200,
      segments: largeSegments,
      words: [],
      fullText: "",
      language: "pt",
    };

    const mockResponse = {
      clips: [
        {
          title: "Clip Chunks",
          description: "Desc",
          startTime: 10,
          endTime: 40,
          viralScore: 9,
          reason: "Reason",
          hashtags: ["#test"],
        },
      ],
    };

    vi.mocked(aiModule.generateObject).mockResolvedValue({
      object: mockResponse,
    } as any);

    const clips = await analyzeTranscript(largeTranscript, "Title", "Channel", mockConfig);
    expect(clips).toHaveLength(1);
    expect(clips[0].title).toBe("Clip Chunks");
  });

  it("should log AbortError differently and still call fallback", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    vi.mocked(aiModule.generateObject).mockRejectedValue(abortError);
    vi.mocked(aiModule.generateText).mockRejectedValue(new Error("fallback also failed"));

    const clips = await analyzeTranscript(mockTranscript, "Title", "Channel", mockConfig);
    expect(clips).toHaveLength(0); // fallback also fails → []
  });

  it("should return empty array when fallback text has no JSON", async () => {
    vi.mocked(aiModule.generateObject).mockRejectedValue(new Error("main failed"));
    vi.mocked(aiModule.generateText).mockResolvedValue({ text: "no json here at all" } as any);
    const clips = await analyzeTranscript(mockTranscript, "Title", "Channel", mockConfig);
    expect(clips).toHaveLength(0);
  });

  it("should parse JSON from fallback generateText response", async () => {
    vi.mocked(aiModule.generateObject).mockRejectedValue(new Error("main failed"));
    vi.mocked(aiModule.generateText).mockResolvedValue({
      text: JSON.stringify({ clips: [{ title: "FB Clip", description: "D", startTime: 10, endTime: 40, viralScore: 8, reason: "R", hashtags: [] }] }),
    } as any);

    const clips = await analyzeTranscript(mockTranscript, "Title", "Channel", mockConfig);
    expect(clips).toHaveLength(1);
    expect(clips[0].title).toBe("FB Clip");
  });

  it("should parse a markdown-fenced top-level array from fallback", async () => {
    vi.mocked(aiModule.generateObject).mockRejectedValue(new Error("main failed"));
    vi.mocked(aiModule.generateText).mockResolvedValue({
      text: "```json\n[{\"title\":\"Arr Clip\",\"description\":\"D\",\"startTime\":10,\"endTime\":40,\"viralScore\":7,\"reason\":\"R\",\"hashtags\":[]}]\n```",
    } as any);

    const clips = await analyzeTranscript(mockTranscript, "Title", "Channel", mockConfig);
    expect(clips).toHaveLength(1);
    expect(clips[0].title).toBe("Arr Clip");
  });

  it("should correctly handle words within the clip range", async () => {
    const mockResponse = {
      clips: [
        {
          title: "Clip Words",
          description: "Desc",
          startTime: 10,
          endTime: 40,
          viralScore: 8,
          reason: "Reason",
          hashtags: ["#test"],
        },
      ],
    };

    vi.mocked(aiModule.generateObject).mockResolvedValue({
      object: mockResponse,
    } as any);

    const transcriptWithWords = {
      ...mockTranscript,
      words: [
        { word: "Inside", start: 9.9, end: 12 },
        { word: "Normal", start: 12, end: 14 }
      ],
    };

    const clips = await analyzeTranscript(transcriptWithWords, "Title", "Channel", mockConfig);
    expect(clips).toHaveLength(1);
    expect(clips[0].words).toHaveLength(2);
    expect(clips[0].words[0].start).toBe(0);
  });
});
