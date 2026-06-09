import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateNarration } from "../../../src/core/quiz/quiz-tts.service.js";
import * as fs from "node:fs";
import * as child_process from "node:child_process";
import { logger } from "../../../src/core/logger.js";

vi.mock("node:fs");
vi.mock("node:child_process");
vi.mock("../../../src/core/logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe("quiz-tts.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should generate narration and parse vtt", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(child_process.spawnSync).mockReturnValue({ status: 0 } as any);
    vi.mocked(fs.readFileSync).mockReturnValue(
      "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello\n\n00:00:02.000 --> 00:00:03.500\nWorld"
    );

    const result = await generateNarration("Hello World", "test", "out");

    expect(fs.mkdirSync).toHaveBeenCalledWith("out", { recursive: true });
    expect(child_process.spawnSync).toHaveBeenCalledWith("python", expect.arrayContaining([
        "-m", "edge_tts",
        "--voice", "pt-BR-ThalitaMultilingualNeural",
        "--text", "Hello World"
    ]), { encoding: "utf-8" });

    expect(result.audioPath).toMatch(/out[/\\]test.mp3/);
    expect(result.wordTimestamps).toHaveLength(2);
    expect(result.wordTimestamps[0]).toEqual({ start: 1, end: 2, word: "Hello" });
    expect(result.wordTimestamps[1]).toEqual({ start: 2, end: 3.5, word: "World" });
  });

  it("should handle existing output directory", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(child_process.spawnSync).mockReturnValue({ status: 0 } as any);
    vi.mocked(fs.readFileSync).mockReturnValue("");

    await generateNarration("Hello", "test", "out");
    expect(fs.mkdirSync).not.toHaveBeenCalled();
  });

  it("should throw error if spawnSync returns error object", async () => {
    const error = new Error("Spawn Failed");
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(child_process.spawnSync).mockReturnValue({ error } as any);

    await expect(generateNarration("Hello", "test", "out")).rejects.toThrow("Falha na narração via edge-tts: Spawn Failed");
    expect(logger.error).toHaveBeenCalled();
  });

  it("should throw error if spawnSync returns non-zero status", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(child_process.spawnSync).mockReturnValue({ status: 1, stderr: "Error text" } as any);

    await expect(generateNarration("Hello", "test", "out")).rejects.toThrow("Falha na narração via edge-tts: Command failed with exit code 1: Error text");
    expect(logger.error).toHaveBeenCalled();
  });

  it("should handle edge cases in vtt parsing", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(child_process.spawnSync).mockReturnValue({ status: 0 } as any);
    vi.mocked(fs.readFileSync).mockReturnValue(
      "WEBVTT\n\n00:00:01.000 -->\nInvalid\n\ninvalid_line\n\n00:00:02.000 --> 00:00:03.000\n" // Missing word
    );

    const result = await generateNarration("Hello", "test", "out");
    expect(result.wordTimestamps).toHaveLength(0); // Should handle missing parts gracefully
  });

  it("should handle malformed time strings", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(child_process.spawnSync).mockReturnValue({ status: 0 } as any);
    vi.mocked(fs.readFileSync).mockReturnValue(
      "WEBVTT\n\n00:01 --> 00:02\nHello"
    );

    const result = await generateNarration("Hello", "test", "out");
    expect(result.wordTimestamps[0].start).toBe(0); // vttTimeToSeconds returns 0 if parts are missing
  });
});
