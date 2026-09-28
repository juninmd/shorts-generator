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

vi.mock("fluent-ffmpeg", () => {
  const mockFfmpeg = () => {};
  mockFfmpeg.ffmpegPath = vi.fn().mockReturnValue("mock-ffmpeg");
  return {
    default: mockFfmpeg,
  };
});

import { renderChapterClip, concatChapterClips, burnSubtitles } from "../../../src/core/comic/comic-video.js";
import * as nodeFs from "node:fs";
import * as cp from "node:child_process";
import ffmpeg from "fluent-ffmpeg";

describe("comic-video", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderChapterClip executes ffmpeg to render clip with fallback ffmpeg path", async () => {
    vi.mocked((ffmpeg as any).ffmpegPath).mockReturnValueOnce(null);
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
    expect(args[0]).toBe("ffmpeg"); // fallback
    expect(args[1]).toContain(chapter.imagePath);
    expect(args[1]).toContain(chapter.audioPath);
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
});