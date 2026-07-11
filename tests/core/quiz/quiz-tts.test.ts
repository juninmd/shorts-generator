import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateNarration, type WordTimestamp } from "../../../src/core/quiz/quiz-tts.service.js";
import child_process from "node:child_process";
import fs from "node:fs";

vi.mock("node:child_process");
vi.mock("node:fs");

describe("quiz-tts.service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("generates narration and parses VTT correctly", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    vi.spyOn(fs, "mkdirSync").mockImplementation(() => undefined);

    vi.mocked(child_process.spawnSync).mockReturnValue({
      status: 0,
      stderr: "",
      stdout: "",
      error: undefined
    } as any);

    const mockVTT = `WEBVTT\n\n00:00:00.000 --> 00:00:00.500\nHello\n00:00:00.500 --> 00:00:01.000\nWorld\n00:00:01.000 -->\nInvalid\nInvalid --> 00:00:01.000\n`;
    vi.spyOn(fs, "readFileSync").mockReturnValue(mockVTT);

    const result = await generateNarration("Hello World", "test");

    expect(result.audioPath).toContain("test.mp3");
    expect(result.wordTimestamps).toHaveLength(2);
    expect(result.wordTimestamps[0]).toEqual({ start: 0, end: 0.5, word: "Hello" });
    expect(result.wordTimestamps[1]).toEqual({ start: 0.5, end: 1, word: "World" });
  });

  it("throws error if spawnSync fails with error object", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(child_process.spawnSync).mockReturnValue({
      error: new Error("python not found")
    } as any);

    await expect(generateNarration("text", "test")).rejects.toThrow("Falha na narração via edge-tts: python not found");
  });

  it("throws error if spawnSync exits with non-zero status", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(child_process.spawnSync).mockReturnValue({
      status: 1,
      stderr: "command failed"
    } as any);

    await expect(generateNarration("text", "test")).rejects.toThrow("Command failed with exit code 1: command failed");
  });

  it("handles malformed time gracefully by returning 0", async () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.mocked(child_process.spawnSync).mockReturnValue({ status: 0 } as any);
      const mockVTT = `WEBVTT\n\nmalformed --> time\nWord\n`;
      vi.spyOn(fs, "readFileSync").mockReturnValue(mockVTT);
      const res = await generateNarration("text", "test");
      expect(res.wordTimestamps[0]).toEqual({ start: 0, end: 0, word: "Word" });
  });
});
