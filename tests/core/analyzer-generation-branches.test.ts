import { beforeEach, describe, expect, it, vi } from "vitest";
import * as aiModule from "ai";
import { analyzeSinglePass } from "../../src/core/analyzer-generation.js";
import * as gjModule from "../../src/core/generate-json.js";
import type { PipelineConfig } from "../../src/types.js";
import { scheduleAbort } from "../../src/core/abort-timeout.js";

vi.mock("ai", () => ({ generateText: vi.fn() }));
vi.mock("../../src/core/generate-json.js", () => ({ generateJsonObject: vi.fn() }));
vi.mock("../../src/core/ai-provider.js", () => ({
  createModel: vi.fn(() => ({ id: "mock" })),
}));
vi.mock("../../src/core/viral-feedback.js", () => ({
  getChannelFeedback: vi.fn(async () => []),
  formatFeedbackForPrompt: vi.fn(() => ""),
}));
vi.mock("../../src/core/abort-timeout.js", () => ({
  scheduleAbort: vi.fn(() => 123 as any),
}));

const config = {
  minShortDuration: 15,
  maxShortDuration: 59,
  aiTimeoutMs: 1000,
} as PipelineConfig;

describe("analyzer generation fallback branches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(gjModule.generateJsonObject).mockRejectedValue(new Error("fallback"));
  });

  it("rejects malformed JSON envelopes", async () => {
    vi.mocked(aiModule.generateText).mockResolvedValue({ text: "[" } as never);
    await expect(analyzeSinglePass("texto", "t", "c", config, 1, 2))
      .resolves.toEqual([]);
  });

  it("filters primitives and normalizes start/end aliases", async () => {
    vi.mocked(aiModule.generateText).mockResolvedValue({
      text: '[null,"x",{"title":"A","start":10,"end":30}]',
    } as never);
    const result = await analyzeSinglePass("texto", "t", "c", config, 1, 2);
    expect(result).toEqual([expect.objectContaining({ startTime: 10, endTime: 30 })]);
  });

  it("accepts one top-level object and preserves explicit timestamps", async () => {
    vi.mocked(aiModule.generateText).mockResolvedValue({
      text: '{"title":"A","startTime":4,"endTime":24}',
    } as never);
    const result = await analyzeSinglePass("texto", "t", "c", config, 1, 2);
    expect(result).toEqual([expect.objectContaining({ startTime: 4, endTime: 24 })]);
  });

  it("defaults missing fallback timestamps to zero", async () => {
    vi.mocked(aiModule.generateText).mockResolvedValue({
      text: '{"clips":[{"title":"A"}]}',
    } as never);
    const result = await analyzeSinglePass("texto", "t", "c", config, 1, 2);
    expect(result[0]).toMatchObject({ startTime: 0, endTime: 0 });
  });

  it("handles fallback parsing empty arrays properly", async () => {
    vi.mocked(aiModule.generateText).mockResolvedValue({
      text: '[]',
    } as never);
    const result = await analyzeSinglePass("texto", "t", "c", config, 1, 2);
    expect(result).toEqual([]);
  });

  it("returns empty array if fallback fails completely", async () => {
    vi.mocked(aiModule.generateText).mockRejectedValue(new Error("fallback failed completely"));
    const result = await analyzeSinglePass("texto", "t", "c", config, 1, 2);
    expect(result).toEqual([]);
  });

  it("returns empty array if fallback text parsing fails", async () => {
    vi.mocked(aiModule.generateText).mockResolvedValue({ text: 'invalid json {' } as never);
    const result = await analyzeSinglePass("texto", "t", "c", config, 1, 2);
    expect(result).toEqual([]);
  });

  it("uses aiTimeoutMs fallback", async () => {
    const configWithoutTimeout = { ...config, aiTimeoutMs: undefined };
    vi.mocked(aiModule.generateText).mockResolvedValue({ text: '[]' } as never);
    const result = await analyzeSinglePass("texto", "t", "c", configWithoutTimeout, 1, 2);
    expect(result).toEqual([]);
    expect(scheduleAbort).toHaveBeenCalledWith(expect.any(AbortController), 300_000);
  });

  it("handles generateJsonObject success where clips is undefined by defaulting to []", async () => {
    vi.mocked(gjModule.generateJsonObject).mockResolvedValueOnce({} as never);
    const result = await analyzeSinglePass("texto", "t", "c", config, 1, 2);
    expect(result).toEqual([]);
  });

  it("parses explicit missing format match properly from text in fallback", async () => {
    vi.mocked(aiModule.generateText).mockResolvedValue({ text: 'just random text' } as never);
    const result = await analyzeSinglePass("texto", "t", "c", config, 1, 2);
    expect(result).toEqual([]);
  });

  it("handles fallback with object lacking clips property returning itself in an array", async () => {
    vi.mocked(aiModule.generateText).mockResolvedValue({ text: '{"startTime": 1, "endTime": 2, "title": "test"}' } as never);
    const result = await analyzeSinglePass("texto", "t", "c", config, 1, 2);
    expect(result).toEqual([{ startTime: 1, endTime: 2, title: "test" }]);
  });
});
