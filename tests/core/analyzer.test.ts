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

  it("should successfully parse JSON embedded directly in text without markdown block", async () => {
    const mockResponse = {
      clips: [
        {
          title: "Clip 2",
          description: "Desc",
          startTime: 10,
          endTime: 40,
          viralScore: 8,
          reason: "Reason",
          hookLine: "Hook",
          hashtags: ["#test"],
        },
      ],
    };
    // The text contains words around the JSON
    vi.mocked(aiModule.generateText).mockResolvedValue({
      text: `Here is the JSON you requested: ${JSON.stringify(mockResponse)} \n\nHope this helps!`,
    } as any);

    const clips = await analyzeTranscript(mockTranscript, "Title", "Channel", mockConfig);
    expect(clips).toHaveLength(1);
    expect(clips[0].title).toBe("Clip 2");
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
          hookLine: "Hook",
          hashtags: ["#test"],
        },
        {
          title: "Too Long",
          description: "Desc",
          startTime: 10,
          endTime: 90, // duration 80 > maxShortDuration 60
          viralScore: 9,
          reason: "Reason",
          hookLine: "Hook",
          hashtags: ["#test"],
        },
        {
          title: "Invalid Times",
          description: "Desc",
          startTime: -10, // < 0
          endTime: 130, // > transcript.duration 120
          viralScore: 9,
          reason: "Reason",
          hookLine: "Hook",
          hashtags: ["#test"],
        },
        {
          title: "Valid",
          description: "Desc",
          startTime: 10,
          endTime: 40, // duration 30
          viralScore: 8,
          reason: "Reason",
          hookLine: "Hook",
          hashtags: ["#test"],
        },
      ],
    };

    vi.mocked(aiModule.generateText).mockResolvedValue({ text: JSON.stringify(mockResponse) } as any);

    const clips = await analyzeTranscript(mockTranscript, "Title", "Channel", mockConfig);

    expect(clips).toHaveLength(1);
    expect(clips[0].title).toBe("Valid");
  });

  it("should return null inside extractAndParseJSON if parsed data is not an object", async () => {
    // This targets line 177 where direct parse fails or returns false
    vi.mocked(aiModule.generateText).mockResolvedValue({
      text: `"just a string instead of object"`,
    } as any);

    const clips = await analyzeTranscript(mockTranscript, "Title", "Channel", mockConfig);
    expect(clips).toHaveLength(0);
  });

  it("should return null inside extractAndParseJSON if parsed json codeblock data is not valid schema", async () => {
    // This targets line 185
    vi.mocked(aiModule.generateText).mockResolvedValue({
      text: `\`\`\`json\n{ "invalid": "schema" }\n\`\`\``,
    } as any);

    const clips = await analyzeTranscript(mockTranscript, "Title", "Channel", mockConfig);
    expect(clips).toHaveLength(0);
  });

  it("should return empty array if getWordsInRange does not match any words", async () => {
    // Targets 318-319
    const mockResponse = {
      clips: [
        {
          title: "Clip 3",
          description: "Desc",
          startTime: 10,
          endTime: 40,
          viralScore: 8,
          reason: "Reason",
          hookLine: "Hook",
          hashtags: ["#test"],
        },
      ],
    };

    vi.mocked(aiModule.generateText).mockResolvedValue({
      text: JSON.stringify(mockResponse),
    } as any);

    const transcriptWithWords = {
      ...mockTranscript,
      words: [{ word: "Outside", start: 100, end: 105 }],
    };

    const clips = await analyzeTranscript(transcriptWithWords, "Title", "Channel", mockConfig);
    expect(clips).toHaveLength(1);
    expect(clips[0].words).toHaveLength(0);
  });

  it("should successfully extract JSON fragment from text when other methods fail", async () => {
    // Tests JSON extraction fallback
    const mockResponse = {
      clips: [
        {
          title: "Fragment Clip",
          description: "Desc",
          startTime: 10,
          endTime: 40,
          viralScore: 8,
          reason: "Reason",
          hookLine: "Hook",
          hashtags: ["#test"],
        },
      ],
    };

    // Simulate invalid markdown block and invalid direct parse, but with valid JSON fragment
    vi.mocked(aiModule.generateText).mockResolvedValue({
      text: `Some text { "clips": ${JSON.stringify(mockResponse.clips)} } some more text`,
    } as any);

    const clips = await analyzeTranscript(mockTranscript, "Title", "Channel", mockConfig);
    expect(clips).toHaveLength(1);
  });

  it("should correctly handle words within the clip range", async () => {
    // Targets line 319 map branch where Math.max(0, w.start - start) occurs
    const mockResponse = {
      clips: [
        {
          title: "Clip Words",
          description: "Desc",
          startTime: 10,
          endTime: 40,
          viralScore: 8,
          reason: "Reason",
          hookLine: "Hook",
          hashtags: ["#test"],
        },
      ],
    };

    vi.mocked(aiModule.generateText).mockResolvedValue({
      text: JSON.stringify(mockResponse),
    } as any);

    const transcriptWithWords = {
      ...mockTranscript,
      words: [
        { word: "Inside", start: 9.9, end: 12 }, // start < 10 but >= 9.9
        { word: "Normal", start: 12, end: 14 }
      ],
    };

    const clips = await analyzeTranscript(transcriptWithWords, "Title", "Channel", mockConfig);
    expect(clips).toHaveLength(1);
    expect(clips[0].words).toHaveLength(2);
    expect(clips[0].words[0].start).toBe(0); // Math.max(0, 9.9 - 10) === 0
  });

  it("should handle invalid JSON on the first try but successfully parse from markdown codeblock on retry", async () => {
    const mockResponse = {
      clips: [
        {
          title: "Retry Clip",
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

    vi.mocked(aiModule.generateText)
      .mockResolvedValueOnce({ text: "completely unparseable string with no json" } as any)
      .mockResolvedValueOnce({ text: `\`\`\`json\n${JSON.stringify(mockResponse)}\n\`\`\`` } as any);

    const clips = await analyzeTranscript(mockTranscript, "Title", "Channel", mockConfig);

    expect(aiModule.generateText).toHaveBeenCalledTimes(2);
    expect(clips).toHaveLength(1);
    expect(clips[0].title).toBe("Retry Clip");
  });
});
