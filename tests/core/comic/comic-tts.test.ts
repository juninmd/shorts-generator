import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupComicMocks } from './comic-test-utils.js';
setupComicMocks();


vi.mock("fluent-ffmpeg", () => {
  return {
    default: {
      ffprobe: vi.fn((file, cb) => cb(null, { format: { duration: 10 } })),
    }
  };
});

import { narrateChapter, narrateChapters } from "../../../src/core/comic/comic-tts.js";
import type { ComicChapter } from "../../../src/core/comic/comic-types.js";
import fs from "node:fs";
import { execFile } from "node:child_process";
import ffmpeg from "fluent-ffmpeg";

describe("comic-tts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(execFile).mockImplementation((...args: any[]) => {
      const cb = args[args.length - 1];
      cb(null, { stdout: "", stderr: "" });
    });
  });

  const chapter: ComicChapter = {
    id: "ch1",
    title: "Ch1",
    imagePath: "a.png",
    narrationText: "text one",
  };

  it("narrateChapter works", async () => {
    // We mock execFile by wrapping it in util.promisify, so we simulate the cb call

    const result = await narrateChapter(chapter, "output", "pt-BR-AntonioNeural");
    expect(result.durationSec).toBe(10);
    expect(result.audioPath).toContain("ch1.mp3");
    expect(result.words).toHaveLength(1);
  });

  it("narrateChapters works", async () => {

    const result = await narrateChapters([chapter], "output", "pt-BR-AntonioNeural");
    expect(result).toHaveLength(1);
    expect(result[0].durationSec).toBe(10);
  });

  it("throws when script is missing", async () => {
    vi.mocked(fs.existsSync).mockReturnValueOnce(false);
    await expect(narrateChapter(chapter, "output", "pt-BR-AntonioNeural")).rejects.toThrow("Missing TTS helper script");
  });

  it("handles ffprobe error", async () => {
        vi.mocked(ffmpeg.ffprobe).mockImplementationOnce((file, cb) => cb(new Error("ffprobe error"), null));
    await expect(narrateChapter(chapter, "output", "pt-BR-AntonioNeural")).rejects.toThrow("ffprobe error");
  });

  it("handles missing duration in ffprobe", async () => {
        vi.mocked(ffmpeg.ffprobe).mockImplementationOnce((file, cb) => cb(null, { format: {} }));
    const res = await narrateChapter(chapter, "output", "pt-BR-AntonioNeural");
    expect(res.durationSec).toBe(0);
  });
});
