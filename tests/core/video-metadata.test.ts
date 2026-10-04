import { beforeEach, describe, expect, it, vi } from "vitest";
import { probeFormat } from "../../src/core/ffmpeg-bin.js";
import { getFileStartTime, getVideoDuration } from "../../src/core/video-processor.js";

vi.mock("../../src/core/ffmpeg-bin.js", () => ({
  probeFormat: vi.fn(),
  ffmpegBin: () => "ffmpeg",
}));

describe("video metadata", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the probed duration", async () => {
    vi.mocked(probeFormat).mockResolvedValueOnce({ duration: "120.5" });
    await expect(getVideoDuration("test.mp4")).resolves.toBe(120.5);
  });

  it("propagates duration probe errors", async () => {
    vi.mocked(probeFormat).mockRejectedValueOnce(new Error("ffprobe error"));
    await expect(getVideoDuration("test.mp4")).rejects.toThrow("ffprobe error");
  });

  it.each([{}, { duration: "N/A" }])("returns zero for missing/invalid duration %o", async (format) => {
    vi.mocked(probeFormat).mockResolvedValueOnce(format);
    await expect(getVideoDuration("test.mp4")).resolves.toBe(0);
  });

  it.each([
    { format: { start_time: "10.5" }, expected: 10.5 },
    { format: { start_time: "invalid" }, expected: 0 },
    { format: {}, expected: 0 },
  ])("maps start metadata to $expected", async ({ format, expected }) => {
    vi.mocked(probeFormat).mockResolvedValueOnce(format);
    await expect(getFileStartTime("test.mp4")).resolves.toBe(expected);
  });

  it("returns zero when the start-time probe fails", async () => {
    vi.mocked(probeFormat).mockRejectedValueOnce(new Error("ffprobe error"));
    await expect(getFileStartTime("test.mp4")).resolves.toBe(0);
  });
});
