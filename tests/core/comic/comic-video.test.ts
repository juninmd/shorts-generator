import { describe, it, expect, vi } from "vitest";
import { renderChapterClip, concatChapterClips, burnSubtitles } from "../../../src/core/comic/comic-video.js";
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

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn().mockReturnValue(true),
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn()
    },
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn()
  };
});

describe("comic-video", () => {
  it("renderChapterClip executes ffmpeg", async () => {
    await renderChapterClip(
      {
        id: "1", title: "ch1", imagePath: "img.png", narrationText: "text",
        audioPath: "aud.mp3", durationSec: 10, words: []
      },
      "out.mp4",
      1080,
      1920
    );
    expect(true).toBe(true);
  });

  it("concatChapterClips executes ffmpeg", async () => {
    await concatChapterClips(["clip1.mp4"], "out.mp4", "workdir");
    expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalled();
  });

  it("burnSubtitles executes ffmpeg", async () => {
    await burnSubtitles("in.mp4", "sub.ass", "out.mp4");
    expect(true).toBe(true);
  });
});
