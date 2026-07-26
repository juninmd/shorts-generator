import { beforeEach, describe, expect, it, vi } from "vitest";
import ffmpeg from "fluent-ffmpeg";
import { getFileStartTime, getVideoDuration } from "../../src/core/video-processor.js";

vi.mock("fluent-ffmpeg", () => {
  const mocked = vi.fn() as any;
  mocked.ffprobe = vi.fn();
  return { default: mocked };
});

describe("video metadata", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the probed duration", async () => {
    vi.mocked(ffmpeg.ffprobe).mockImplementationOnce((path, callback) => {
      callback(null, { format: { duration: 120 } } as any);
    });
    await expect(getVideoDuration("test.mp4")).resolves.toBe(120);
  });

  it("propagates duration probe errors", async () => {
    vi.mocked(ffmpeg.ffprobe).mockImplementationOnce((path, callback) => {
      callback(new Error("ffprobe error"), null as any);
    });
    await expect(getVideoDuration("test.mp4")).rejects.toThrow("ffprobe error");
  });

  it("returns zero when duration metadata is missing", async () => {
    vi.mocked(ffmpeg.ffprobe).mockImplementationOnce((path, callback) => {
      callback(null, {} as any);
    });
    await expect(getVideoDuration("test.mp4")).resolves.toBe(0);
  });

  it.each([
    { format: { start_time: "10.5" }, expected: 10.5 },
    { format: { start_time: "invalid" }, expected: 0 },
    { format: {}, expected: 0 },
  ])("maps start metadata to $expected", async ({ format, expected }) => {
    vi.mocked(ffmpeg.ffprobe).mockImplementationOnce((path, callback) => {
      callback(null, { format } as any);
    });
    await expect(getFileStartTime("test.mp4")).resolves.toBe(expected);
  });

  it("returns zero when the start-time probe fails", async () => {
    vi.mocked(ffmpeg.ffprobe).mockImplementationOnce((path, callback) => {
      callback(new Error("ffprobe error"), null as any);
    });
    await expect(getFileStartTime("test.mp4")).resolves.toBe(0);
  });
});
