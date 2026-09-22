import { describe, it, expect, vi, beforeEach } from "vitest";
import * as video from "../../../src/core/comic/comic-video.js";
import fs from "node:fs";
import { execFile } from "node:child_process";
import ffmpeg from "fluent-ffmpeg";
import * as env from "../../../src/core/ffmpeg-env.js";

vi.mock("node:fs", () => ({
  default: { writeFileSync: vi.fn(), existsSync: vi.fn(() => false) },
  writeFileSync: vi.fn(),
  existsSync: vi.fn(() => false)
}));

vi.mock("node:child_process", () => ({
  execFile: vi.fn((...args) => { const cb = args[args.length - 1]; if (typeof cb === 'function') cb(null, { stdout: "", stderr: "" }); }),
}));

vi.mock("fluent-ffmpeg", () => ({
  default: {
    ffmpegPath: vi.fn(() => "/path/to/ffmpeg"),
  },
}));

vi.mock("../../../src/core/ffmpeg-env.js", () => ({
  buildFontEnv: vi.fn(() => ({})),
}));

describe("comic-video", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderChapterClip should run ffmpeg with correct args", async () => {
    await video.renderChapterClip(
      { id: "1", title: "T", imagePath: "img.png", narrationText: "txt", audioPath: "aud.mp3", durationSec: 10, words: [] },
      "out.mp4",
      1080,
      1920
    );
    expect(execFile).toHaveBeenCalled();
    const args = vi.mocked(execFile).mock.calls[0][1];
    expect(args).toContain("img.png");
    expect(args).toContain("aud.mp3");
    expect(args).toContain("out.mp4");
  });

  it("concatChapterClips should run ffmpeg with concat demuxer", async () => {
    await video.concatChapterClips(["c1.mp4", "c2.mp4"], "out.mp4", "/tmp");
    expect(fs.writeFileSync).toHaveBeenCalled();
    expect(execFile).toHaveBeenCalled();
    const args = vi.mocked(execFile).mock.calls[0][1];
    expect(args).toContain("concat");
    expect(args).toContain("out.mp4");
  });

  it("burnSubtitles should run ffmpeg with subtitle filter", async () => {
    await video.burnSubtitles("in.mp4", "sub.ass", "out.mp4");
    expect(execFile).toHaveBeenCalled();
    const args = vi.mocked(execFile).mock.calls[0][1];
    expect(args).toContain("in.mp4");
    expect(args).toContain("out.mp4");
  });

  it("uses default ffmpeg string if ffmpegPath is missing", async () => {
      vi.mocked(ffmpeg.ffmpegPath).mockReturnValueOnce(undefined as any);
      await video.concatChapterClips([], "out.mp4", "/tmp");
      expect(execFile).toHaveBeenCalled();
      const cmd = vi.mocked(execFile).mock.calls[0][0];
      expect(cmd).toBe("ffmpeg");
  });
});
