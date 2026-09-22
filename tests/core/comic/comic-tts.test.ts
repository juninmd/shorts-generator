import { describe, it, expect, vi, beforeEach } from "vitest";
import * as tts from "../../../src/core/comic/comic-tts.js";
import fs from "node:fs";
import { execFile } from "node:child_process";
import ffmpeg from "fluent-ffmpeg";

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
  },
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFile: vi.fn((...args) => { const cb = args[args.length - 1]; if (typeof cb === 'function') cb(null, { stdout: "", stderr: "" }); }),
}));

vi.mock("fluent-ffmpeg", () => ({
  default: {
    ffprobe: vi.fn((file, cb) => cb(null, { format: { duration: 5 } })),
  },
}));

describe("comic-tts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should throw if tts script is missing", async () => {
    vi.mocked(fs.existsSync).mockReturnValueOnce(false);
    await expect(tts.narrateChapter({ id: "1", title: "T", imagePath: "i", narrationText: "text" }, "/tmp", "voice"))
      .rejects.toThrow(/Missing TTS helper script/);
  });

  it("should narrate chapter successfully", async () => {
    vi.mocked(fs.existsSync).mockReturnValueOnce(true);
    vi.mocked(fs.readFileSync).mockReturnValueOnce(JSON.stringify([{ word: "text", start: 0, end: 1 }]));

    const res = await tts.narrateChapter({ id: "1", title: "T", imagePath: "i", narrationText: "text" }, "/tmp", "voice");
    expect(res.durationSec).toBe(5);
    expect(res.audioPath).toContain("1.mp3");
  });

  it("should return 0 duration if ffprobe is missing duration", async () => {
    vi.mocked(fs.existsSync).mockReturnValueOnce(true);
    vi.mocked(fs.readFileSync).mockReturnValueOnce(JSON.stringify([]));
    vi.mocked(ffmpeg.ffprobe).mockImplementationOnce((file, cb) => (cb as any)(null, {}));

    const res = await tts.narrateChapter({ id: "1", title: "T", imagePath: "i", narrationText: "text" }, "/tmp", "voice");
    expect(res.durationSec).toBe(0);
  });

  it("should throw if ffprobe fails", async () => {
    vi.mocked(fs.existsSync).mockReturnValueOnce(true);
    vi.mocked(fs.readFileSync).mockReturnValueOnce(JSON.stringify([]));
    vi.mocked(ffmpeg.ffprobe).mockImplementationOnce((file, cb) => (cb as any)(new Error("ffprobe err")));

    await expect(tts.narrateChapter({ id: "1", title: "T", imagePath: "i", narrationText: "text" }, "/tmp", "voice"))
      .rejects.toThrow("ffprobe err");
  });

  it("should return correct array from narrateChapters", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify([{ word: "text", start: 0, end: 1 }]));

    const res = await tts.narrateChapters([{ id: "1", title: "T", imagePath: "i", narrationText: "text" }, { id: "2", title: "T2", imagePath: "i2", narrationText: "text2" }], "/tmp", "voice");
    expect(res).toHaveLength(2);
    expect(res[0].durationSec).toBe(5);
    expect(res[1].durationSec).toBe(5);
  });
});
