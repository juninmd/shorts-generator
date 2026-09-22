import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const overrides = {
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
  return { ...actual, ...overrides, default: { ...(actual as any).default, ...overrides } };
});

vi.mock("fluent-ffmpeg", () => {
  return {
    default: {
      ffmpegPath: vi.fn(() => "custom-ffmpeg"),
    }
  };
});

import { renderChapterClip, concatChapterClips, burnSubtitles } from "../../../src/core/comic/comic-video.js";
import { execFile } from "node:child_process";
import ffmpeg from "fluent-ffmpeg";

describe("comic-video", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(execFile).mockImplementation((...args: any[]) => {
      const cb = args[args.length - 1];
      cb(null, { stdout: "", stderr: "" });
    });
  });

  const narratedChapter = {
    id: "ch1",
    title: "Ch1",
    imagePath: "a.png",
    narrationText: "text one",
    audioPath: "a.mp3",
    durationSec: 10,
    words: [],
  };

  it("renderChapterClip works", async () => {

    await renderChapterClip(narratedChapter, "output.mp4", 1080, 1920);
    expect(execFile).toHaveBeenCalled();
    const args = vi.mocked(execFile).mock.calls[0][1] as string[];
    expect(args).toContain("-t");
    expect(args).toContain("10");
  });

  it("concatChapterClips works", async () => {

    await concatChapterClips(["a.mp4", "b.mp4"], "concat.mp4", "workdir");
    expect(execFile).toHaveBeenCalled();
  });

  it("burnSubtitles works", async () => {

    await burnSubtitles("concat.mp4", "sub.ass", "output.mp4");
    expect(execFile).toHaveBeenCalled();
  });

  it("uses default ffmpeg if ffmpegPath is not available", async () => {

    // override ffmpegPath mock just for this test
    (ffmpeg as any).ffmpegPath = undefined;

    await burnSubtitles("concat.mp4", "sub.ass", "output.mp4");
    expect(execFile).toHaveBeenCalled();
    const cmd = vi.mocked(execFile).mock.calls[0][0];
    expect(cmd).toBe("ffmpeg");
  });
});
