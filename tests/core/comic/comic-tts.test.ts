import { describe, it, expect, vi } from "vitest";
import { narrateChapter, narrateChapters } from "../../../src/core/comic/comic-tts.js";
import fs from "node:fs";

vi.mock("node:child_process", () => ({
  execFile: vi.fn((cmd, args, opts, cb) => {
    let callback = cb;
    if (typeof opts === 'function') {
        callback = opts;
    }
    if (callback) callback(null, { stdout: "", stderr: "" });
  })
}));

let ffprobeMockDuration: any = { format: { duration: 15 } };
vi.mock("fluent-ffmpeg", () => ({
  default: {
    ffprobe: vi.fn((file, cb) => {
      if (file.includes("error")) {
        cb(new Error("ffprobe error"));
      } else {
        cb(null, ffprobeMockDuration);
      }
    })
  }
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn().mockReturnValue(true),
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
      readFileSync: vi.fn().mockReturnValue(JSON.stringify([{word: "test", start: 0, end: 1}]))
    },
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue(JSON.stringify([{word: "test", start: 0, end: 1}]))
  };
});

describe("comic-tts", () => {
  const dummyChapter = {
    id: "ch1",
    title: "title",
    imagePath: "img.png",
    narrationText: "text"
  };

  it("narrateChapter synthesizes audio", async () => {
    ffprobeMockDuration = { format: { duration: 15 } };
    const result = await narrateChapter(dummyChapter, "outdir", "voice");
    expect(result.durationSec).toBe(15);
    expect(result.words.length).toBe(1);
    expect(result.audioPath).toContain("ch1.mp3");
  });

  it("narrateChapter handles ffprobe missing duration", async () => {
    ffprobeMockDuration = {};
    const result = await narrateChapter(dummyChapter, "outdir", "voice");
    expect(result.durationSec).toBe(0);
    ffprobeMockDuration = { format: { duration: 15 } };
  });

  it("narrateChapter throws if script missing", async () => {
    vi.mocked(fs.existsSync).mockReturnValueOnce(false);
    await expect(narrateChapter(dummyChapter, "outdir", "voice")).rejects.toThrow(/Missing TTS helper script/);
  });

  it("narrateChapter throws if ffprobe fails", async () => {
     await expect(narrateChapter({...dummyChapter, id: "error"}, "outdir", "voice")).rejects.toThrow(/ffprobe error/);
  });

  it("narrateChapters processes multiple chapters", async () => {
    const results = await narrateChapters([dummyChapter, dummyChapter], "outdir", "voice");
    expect(results.length).toBe(2);
  });
});
