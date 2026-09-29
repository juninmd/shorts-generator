import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => ({
  execFile: vi.fn((cmd, args, opts, cb) => {
    let callback = cb;
    if (!callback && typeof opts === "function") callback = opts;
    if (!callback && args && typeof args[args.length - 1] === "function") callback = args[args.length - 1];

    if (callback) {
      callback(null, { stdout: "", stderr: "" });
    }
  }),
}));

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock("fluent-ffmpeg", () => ({
  default: {
    ffmpegPath: vi.fn(() => "mock-ffmpeg"),
  },
}));

vi.mock("../../../src/core/ffmpeg-env.js", () => ({
  buildFontEnv: vi.fn(() => ({ FONTCONFIG_PATH: "/test" })),
}));

vi.mock("../../../src/core/logger.js", () => ({
  logger: { info: vi.fn() },
}));

import { renderChapterClip, concatChapterClips, burnSubtitles } from "../../../src/core/comic/comic-video.js";
import { execFile } from "node:child_process";
import fs from "node:fs";

import ffmpeg from "fluent-ffmpeg";
describe("comic-video", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderChapterClip executes ffmpeg with zoompan", async () => {
    const chapter = { id: "ch1", title: "test", imagePath: "a.png", narrationText: "hello", audioPath: "a.mp3", durationSec: 2, words: [] };
    await renderChapterClip(chapter, "out.mp4", 1080, 1920);
    expect(execFile).toHaveBeenCalled();
    const args = vi.mocked(execFile).mock.calls[0][1];
    expect(args).toContain("-vf");
  });

  it("concatChapterClips executes ffmpeg with concat", async () => {
    await concatChapterClips(["a.mp4", "b.mp4"], "out.mp4", "/tmp");
    expect(fs.writeFileSync).toHaveBeenCalled();
    expect(execFile).toHaveBeenCalled();
    const args = vi.mocked(execFile).mock.calls[0][1];
    expect(args).toContain("concat");
  });

  it("burnSubtitles executes ffmpeg with subtitles filter", async () => {
    await burnSubtitles("in.mp4", "sub.ass", "out.mp4");
    expect(execFile).toHaveBeenCalled();
    const args = vi.mocked(execFile).mock.calls[0][1];
    expect(args).toContain("subtitles='sub.ass'");
  });

  it("getFfmpegPath fallback to ffmpeg", async () => {
    vi.mocked(ffmpeg.ffmpegPath).mockReturnValueOnce(undefined);
    await burnSubtitles("in.mp4", "sub.ass", "out.mp4");
  });

});
