import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => ({
  execFile: vi.fn((cmd, args, opts, cb) => {
    cb(null, { stdout: "", stderr: "" });
  }),
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal();
  const overrides = {
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(() => JSON.stringify([{ word: "test", start: 0, end: 1 }])),
  };
  return {
    ...actual,
    ...overrides,
    default: {
      ...(actual.default || actual),
      ...overrides,
    },
  };
});

vi.mock("fluent-ffmpeg", () => {
  return {
    default: {
      ffprobe: vi.fn((file, cb) => {
        cb(null, { format: { duration: 5 } });
      }),
    },
  };
});

import { narrateChapter, narrateChapters } from "../../../src/core/comic/comic-tts.js";
import * as nodeFs from "node:fs";
import ffmpeg from "fluent-ffmpeg";

describe("comic-tts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("narrateChapter generates audio for a chapter", async () => {
    const chapter = {
      id: "ch1",
      title: "Ch1",
      imagePath: "ch1.png",
      narrationText: "test narration",
    };

    const result = await narrateChapter(chapter, "/out", "voice");

    expect(result.id).toBe("ch1");
    expect(result.audioPath).toContain("ch1.mp3");
    expect(result.durationSec).toBe(5);
    expect(result.words.length).toBe(1);

    expect(nodeFs.writeFileSync).toHaveBeenCalledWith(expect.stringContaining("ch1.txt"), "test narration", "utf-8");
  });

  it("narrateChapter throws if tts script is missing", async () => {
    vi.mocked(nodeFs.existsSync).mockReturnValueOnce(false);

    await expect(
      narrateChapter({ id: "ch1", title: "", imagePath: "", narrationText: "" }, "/out", "voice")
    ).rejects.toThrow("Missing TTS helper script");
  });

  it("narrateChapters processes multiple chapters", async () => {
    const chapters = [
      { id: "ch1", title: "Ch1", imagePath: "ch1.png", narrationText: "test 1" },
      { id: "ch2", title: "Ch2", imagePath: "ch2.png", narrationText: "test 2" },
    ];

    const results = await narrateChapters(chapters, "/out", "voice");

    expect(results.length).toBe(2);
    expect(results[0].id).toBe("ch1");
    expect(results[1].id).toBe("ch2");
  });

  it("narrateChapter handles ffprobe errors by rejecting", async () => {
    const err = new Error("ffprobe error");
    vi.mocked(ffmpeg.ffprobe).mockImplementationOnce((file, cb) => {
      cb(err, null);
    });

    const chapter = { id: "ch1", title: "Ch1", imagePath: "ch1.png", narrationText: "test narration" };
    await expect(narrateChapter(chapter, "/out", "voice")).rejects.toThrow("ffprobe error");
  });

  it("narrateChapter handles ffprobe duration fallbacks", async () => {
    vi.mocked(ffmpeg.ffprobe).mockImplementationOnce((file, cb) => {
      cb(null, { format: {} }); // no duration
    });

    const chapter = { id: "ch1", title: "Ch1", imagePath: "ch1.png", narrationText: "test narration" };
    const result = await narrateChapter(chapter, "/out", "voice");
    expect(result.durationSec).toBe(0);
  });
});
