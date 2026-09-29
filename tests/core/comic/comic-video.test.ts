import { describe, it, expect, vi, beforeEach } from "vitest";
import * as child_process from "node:child_process";
import fs from "node:fs";
import ffmpeg from "fluent-ffmpeg";
import { renderChapterClip, concatChapterClips, burnSubtitles } from "../../../src/core/comic/comic-video.js";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));
vi.mock("node:fs");
vi.mock("fluent-ffmpeg");

describe("comic-video", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderChapterClip executes ffmpeg", async () => {
    (ffmpeg as any).ffmpegPath = vi.fn().mockReturnValue("mock-ffmpeg");
    vi.mocked(child_process.execFile).mockImplementation(((...args: any[]) => {
      const callback = args[args.length - 1];
      if (typeof callback === "function") {
        callback(null, { stdout: "ok", stderr: "" });
      }
      return {} as any;
    }) as any);

    await renderChapterClip({
      id: "ch1",
      title: "Title",
      imagePath: "image.png",
      narrationText: "Text",
      audioPath: "audio.mp3",
      durationSec: 5,
      words: []
    }, "out.mp4", 1080, 1920);

    expect(child_process.execFile).toHaveBeenCalled();
  });

  it("concatChapterClips executes ffmpeg", async () => {
    (ffmpeg as any).ffmpegPath = vi.fn().mockReturnValue("mock-ffmpeg");
    vi.spyOn(fs, "writeFileSync").mockImplementation(() => undefined);
    vi.mocked(child_process.execFile).mockImplementation(((...args: any[]) => {
      const callback = args[args.length - 1];
      if (typeof callback === "function") {
        callback(null, { stdout: "ok", stderr: "" });
      }
      return {} as any;
    }) as any);

    await concatChapterClips(["clip1.mp4", "clip2.mp4"], "out.mp4", "/tmp");

    expect(fs.writeFileSync).toHaveBeenCalled();
    expect(child_process.execFile).toHaveBeenCalled();
  });

  it("burnSubtitles executes ffmpeg", async () => {
    (ffmpeg as any).ffmpegPath = vi.fn().mockReturnValue("mock-ffmpeg");
    vi.mocked(child_process.execFile).mockImplementation(((...args: any[]) => {
      const callback = args[args.length - 1];
      if (typeof callback === "function") {
        callback(null, { stdout: "ok", stderr: "" });
      }
      return {} as any;
    }) as any);

    await burnSubtitles("input.mp4", "sub.ass", "out.mp4");

    expect(child_process.execFile).toHaveBeenCalled();
  });

  it("getFfmpegPath falls back to 'ffmpeg'", async () => {
    (ffmpeg as any).ffmpegPath = undefined;
    vi.mocked(child_process.execFile).mockImplementation(((...args: any[]) => {
      const callback = args[args.length - 1];
      if (typeof callback === "function") {
        callback(null, { stdout: "ok", stderr: "" });
      }
      return {} as any;
    }) as any);

    await burnSubtitles("input.mp4", "sub.ass", "out.mp4");

    expect(child_process.execFile).toHaveBeenCalledWith("ffmpeg", expect.any(Array), expect.any(Object), expect.any(Function));
  });
});
