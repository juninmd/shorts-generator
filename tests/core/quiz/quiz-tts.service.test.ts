import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { generateNarration } from "../../../src/core/quiz/quiz-tts.service";
import { logger } from "../../../src/core/logger";

vi.mock("node:child_process");
vi.mock("node:fs");
vi.mock("../../../src/core/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe("Quiz TTS Service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should generate narration successfully", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false); // tempDir not exists
    vi.mocked(spawnSync).mockReturnValue({ status: 0, error: undefined, stdout: "", stderr: "" } as any);

    const vttContent = `WEBVTT

00:00:01.000 --> 00:00:02.000
Word1

00:00:02.500 --> 00:00:03.500
Word2

invalid --> format
Word3

`;
    vi.mocked(fs.readFileSync).mockReturnValue(vttContent);

    const res = await generateNarration("Test text", "test-file", "temp_dir");

    expect(fs.mkdirSync).toHaveBeenCalledWith("temp_dir", { recursive: true });
    expect(spawnSync).toHaveBeenCalledWith("python", expect.arrayContaining([
      "-m", "edge_tts", "--voice", "pt-BR-ThalitaMultilingualNeural", "--text", "Test text"
    ]), expect.any(Object));

    expect(res.audioPath).toContain("test-file.mp3");
    // "invalid --> format" evaluates to startStr="invalid", endStr="format", which parses h,m,s as NaN => 0.
    expect(res.wordTimestamps).toHaveLength(3);
    expect(res.wordTimestamps[0]).toEqual({ start: 1, end: 2, word: "Word1" });
    expect(res.wordTimestamps[1]).toEqual({ start: 2.5, end: 3.5, word: "Word2" });
    expect(res.wordTimestamps[2]).toEqual({ start: 0, end: 0, word: "Word3" });
  });

  it("should handle spawnSync execution error", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(spawnSync).mockReturnValue({ error: new Error("Spawn error") } as any);

    await expect(generateNarration("text", "test")).rejects.toThrow("Falha na narração via edge-tts: Spawn error");
    expect(logger.error).toHaveBeenCalledWith({ error: "Spawn error" }, expect.any(String));
  });

  it("should handle non-zero exit code", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(spawnSync).mockReturnValue({ status: 1, stderr: "CLI Error" } as any);

    await expect(generateNarration("text", "test")).rejects.toThrow("Command failed with exit code 1: CLI Error");
  });

  it("should handle invalid VTT timestamp formats (missing parts length < 2)", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(spawnSync).mockReturnValue({ status: 0 } as any);
    vi.mocked(fs.readFileSync).mockReturnValue(`
00:00:01.000 ->
Word
`);
    // -> not -->, won't match line.includes("-->")

    const res = await generateNarration("text", "test");
    expect(res.wordTimestamps).toHaveLength(0);
  });

  it("should handle invalid VTT timestamp format (missing end side)", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(spawnSync).mockReturnValue({ status: 0 } as any);
    vi.mocked(fs.readFileSync).mockReturnValue(`
00:00:01.000 -->
Word
`);
    // "00:00:01.000 --> ".split(" --> ") yields ["00:00:01.000", ""]
    const res = await generateNarration("text", "test");
    expect(res.wordTimestamps).toHaveLength(0);
  });

  it("should cover if word is empty string", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(spawnSync).mockReturnValue({ status: 0 } as any);
    vi.mocked(fs.readFileSync).mockReturnValue(`
00:00:01.000 --> 00:00:02.000

`); // Only spaces, trim() makes it "" which is falsy

    const res = await generateNarration("text", "test");
    expect(res.wordTimestamps).toHaveLength(0);
  });

  it("should handle nextLine undefined (--> on last line)", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(spawnSync).mockReturnValue({ status: 0 } as any);
    // VTT with --> at the very last line, so i + 1 is undefined
    vi.mocked(fs.readFileSync).mockReturnValue(`00:00:01.000 --> 00:00:02.000`);

    const res = await generateNarration("text", "test");
    expect(res.wordTimestamps).toHaveLength(0);
  });

  it("should handle vttTimeToSeconds undefined components branch", async () => {
     vi.mocked(fs.existsSync).mockReturnValue(true);
     vi.mocked(spawnSync).mockReturnValue({ status: 0 } as any);
     vi.mocked(fs.readFileSync).mockReturnValue(`
00:00 --> 00:01
Word
`);
     const res = await generateNarration("text", "test");
     expect(res.wordTimestamps[0].start).toBe(0); // Because "00:00".split(":") -> length 2, s is undefined.
  });

  it("should handle error without message", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(spawnSync).mockImplementation(() => { throw "String error"; });

    await expect(generateNarration("text", "test")).rejects.toThrow("Falha na narração via edge-tts: undefined");
    expect(logger.error).toHaveBeenCalledWith({ error: undefined }, expect.any(String));
  });

  it("should cover fallback for error.message on non-Error exceptions explicitly", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(spawnSync).mockImplementation(() => { throw { status: "fail" }; });

    await expect(generateNarration("text", "test")).rejects.toThrow("Falha na narração via edge-tts: undefined");
  });

  it("should throw standard error object so error.message is present and logged", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(spawnSync).mockImplementation(() => { throw new Error("A standard error"); });

    await expect(generateNarration("text", "test")).rejects.toThrow("Falha na narração via edge-tts: A standard error");
    expect(logger.error).toHaveBeenCalledWith({ error: "A standard error" }, expect.any(String));
  });

  it("should explicitly cover error as any block where message exists", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const mockError = new Error("Manual Error");
    vi.mocked(spawnSync).mockImplementation(() => { throw mockError; });

    await expect(generateNarration("text", "test")).rejects.toThrow("Falha na narração via edge-tts: Manual Error");
  });
});
