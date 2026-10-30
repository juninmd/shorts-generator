import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => ({
  execFile: vi.fn((...args) => {
    const cb = args[args.length - 1];
    if (typeof cb === 'function') cb(null, { stdout: "", stderr: "" });
  }),
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal();
  const overrides = {
    writeFileSync: vi.fn(),
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

vi.mock("../../../src/core/ffmpeg-bin.js", () => ({
  ffmpegBin: () => "mock-ffmpeg",
  probeVideoStream: vi.fn(async () => ({ color_space: "bt709" })),
}));

import { renderChapterClip, concatChapterClips, burnSubtitles } from "../../../src/core/comic/comic-video.js";
import * as nodeFs from "node:fs";
import * as cp from "node:child_process";
import { probeVideoStream } from "../../../src/core/ffmpeg-bin.js";

describe("comic-video", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderChapterClip executes ffmpeg to render clip", async () => {
    const chapter = {
      id: "ch1",
      title: "Ch1",
      imagePath: "ch1.png",
      narrationText: "text",
      audioPath: "ch1.mp3",
      durationSec: 5,
      words: [],
    };
    await renderChapterClip(chapter, "out.mp4", 1080, 1920);
    expect(cp.execFile).toHaveBeenCalled();
    const args = vi.mocked(cp.execFile).mock.calls[0];
    expect(args[0]).toBe("mock-ffmpeg");
    expect(args[1]).toContain(chapter.imagePath);
    expect(args[1]).toContain(chapter.audioPath);
  });

  it("concatChapterClips generates list and concatenates clips", async () => {
    await concatChapterClips(["clip1.mp4", "clip2.mp4"], "concat.mp4", "/work");
    expect(nodeFs.writeFileSync).toHaveBeenCalled();
    expect(cp.execFile).toHaveBeenCalled();
    const args = vi.mocked(cp.execFile).mock.calls[0];
    expect(args[0]).toBe("mock-ffmpeg");
    expect(args[1]).toContain("-f");
    expect(args[1]).toContain("concat");
  });

  it("burnSubtitles burns subtitles to video", async () => {
    await burnSubtitles("input.mp4", "sub.ass", "output.mp4");
    expect(cp.execFile).toHaveBeenCalled();
    const args = vi.mocked(cp.execFile).mock.calls[0];
    expect(args[0]).toBe("mock-ffmpeg");
    expect(args[1]).toContain("-vf");
    expect(args[1]).toContain("subtitles='sub.ass'");
  });

  it("renderChapterClip loops stock footage under the narration when videoPath is set", async () => {
    await renderChapterClip({
      id: "s1", title: "s", imagePath: "", videoPath: "stock.mp4", narrationText: "t",
      audioPath: "s1.mp3", durationSec: 4, words: [],
    }, "out.mp4", 1080, 1920);
    const args = vi.mocked(cp.execFile).mock.calls[0][1] as string[];
    expect(args).toEqual(expect.arrayContaining(["-stream_loop", "-1", "stock.mp4", "s1.mp3", "0:v", "1:a", "4"]));
    expect(args.join(" ")).toContain("force_original_aspect_ratio=increase,crop=1080:1920");
    expect(args).not.toContain("-loop");
  });

  it("converts an SD stock clip with its own BT.601 matrix before scaling", async () => {
    vi.mocked(probeVideoStream).mockResolvedValueOnce({ color_space: "smpte170m" } as any);
    await renderChapterClip({
      id: "s2", title: "s", imagePath: "", videoPath: "stock.mp4", narrationText: "t",
      audioPath: "s2.mp3", durationSec: 4, words: [],
    }, "out.mp4", 1080, 1920);
    const args = vi.mocked(cp.execFile).mock.calls[0][1] as string[];
    expect(args[args.indexOf("-vf") + 1]).toContain("colorspace=all=bt709:iall=smpte170m:fast=1,scale=");
  });

  it("does not relabel an HDR chapter as BT.709 on the final burn", async () => {
    vi.mocked(probeVideoStream).mockResolvedValueOnce({ color_space: "bt2020nc", color_transfer: "smpte2084" } as any);
    await burnSubtitles("input.mp4", "sub.ass", "output.mp4");
    const args = vi.mocked(cp.execFile).mock.calls[0][1] as string[];
    expect(args).not.toContain("-colorspace");
    expect(args).not.toContain("-x264-params");
  });

  it("burnSubtitles mixes ducked background music when a track is given", async () => {    await burnSubtitles("input.mp4", "sub.ass", "output.mp4", { path: "bgm.mp3", durationSec: 30 });
    const args = vi.mocked(cp.execFile).mock.calls[0][1] as string[];
    expect(args).toEqual(expect.arrayContaining(["-stream_loop", "-1", "bgm.mp3", "[v]", "[aout]", "30"]));
    const graph = args[args.indexOf("-filter_complex") + 1]!;
    expect(graph).toContain("[0:v]subtitles='sub.ass'[v];[0:a]anull");
    expect(graph).toContain("sidechaincompress");
    expect(args).not.toContain("copy");
  });
});
