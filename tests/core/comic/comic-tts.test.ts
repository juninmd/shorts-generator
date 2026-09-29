import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => ({
  execFile: vi.fn((cmd, args, opts, cb) => {
    // If util.promisify is used, cb is the last arg
    if (typeof cb === "function") cb(null, { stdout: "", stderr: "" });
    else if (typeof opts === "function") opts(null, { stdout: "", stderr: "" });
  }),
}));

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(() => JSON.stringify([{ word: "test", start: 0, end: 1 }])),
  },
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(() => JSON.stringify([{ word: "test", start: 0, end: 1 }])),
}));

vi.mock("fluent-ffmpeg", () => ({
  default: {
    ffprobe: vi.fn((path, cb) => {
      cb(null, { format: { duration: 5 } });
    }),
  },
}));

vi.mock("../../src/core/logger.js", () => ({
  logger: { info: vi.fn() },
}));

import { narrateChapter, narrateChapters } from "../../../src/core/comic/comic-tts.js";
import fs from "node:fs";

import ffmpeg from "fluent-ffmpeg";
describe("comic-tts", () => {
  const chapter = { id: "ch1", title: "test", imagePath: "a.png", narrationText: "hello" };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("narrateChapter works", async () => {
    const result = await narrateChapter({ id: "ch1", title: "test", imagePath: "a.png", narrationText: "hello" }, "/tmp", "voice-1");
    expect(result.durationSec).toBe(5);
    expect(result.words.length).toBe(1);
    expect(result.audioPath).toBe("/tmp/ch1.mp3");
  });

  it("narrateChapter throws if script missing", async () => {
    vi.mocked(fs.existsSync).mockReturnValueOnce(false);
    await expect(narrateChapter(chapter, "/tmp", "voice-1")).rejects.toThrow("Missing TTS helper script");
  });

  it("narrateChapters works", async () => {
    const results = await narrateChapters([chapter, chapter], "/tmp", "voice-1");
    expect(results.length).toBe(2);
  });

  it("getVideoDuration fallback to 0 if duration is missing", async () => {
    vi.mocked(ffmpeg.ffprobe).mockImplementationOnce((path, cb) => {
      cb(null, { format: {} });
    });
    const result = await narrateChapter({ id: "ch1", title: "test", imagePath: "a.png", narrationText: "hello" }, "/tmp", "voice-1");
    expect(result.durationSec).toBe(0);
  });


  it("narrateChapter throws if ffprobe fails", async () => {
    vi.mocked(ffmpeg.ffprobe).mockImplementationOnce((path, cb) => cb(new Error("ffprobe error"), null));
    await expect(narrateChapter(chapter, "/tmp", "voice-1")).rejects.toThrow("ffprobe error");
  });
});
