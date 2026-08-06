import { describe, expect, it, vi } from "vitest";
import { execFile } from "node:child_process";
import {
  assertShortMediaQuality,
  validateShortMetadata,
} from "../../src/core/short-quality.js";

vi.mock("node:child_process", () => ({ execFile: vi.fn() }));

const expected = { duration: 15, width: 1080, height: 1920 };
const validMetadata = () => ({
  format: { duration: "15" },
  streams: [
    {
      codec_type: "video",
      codec_name: "h264",
      width: 1080,
      height: 1920,
      r_frame_rate: "30/1",
    },
    {
      codec_type: "audio",
      codec_name: "aac",
      sample_rate: "44100",
      channels: 2,
    },
  ],
});

describe("short media quality gate", () => {
  it("rejects a rendered video that is not vertical", () => {
    const metadata = validMetadata();
    metadata.streams[0]!.width = 1920;
    metadata.streams[0]!.height = 1080;

    expect(() => validateShortMetadata(metadata as any, expected))
      .toThrow("resolution 1920x1080; expected 1080x1920");
  });

  it("rejects when video stream is missing dimensions", () => {
    const metadata = validMetadata();
    metadata.streams[0]!.width = undefined as any;
    metadata.streams[0]!.height = undefined as any;

    expect(() => validateShortMetadata(metadata as any, expected))
      .toThrow("resolution 0x0; expected 1080x1920");
  });

  it("rejects a rendered short without audio", () => {
    const metadata = validMetadata();
    metadata.streams = metadata.streams.filter((stream) => stream.codec_type !== "audio");

    expect(() => validateShortMetadata(metadata as any, expected))
      .toThrow("audio stream missing");
  });

  it("rejects a short whose rendered duration drifted from the selected cut", () => {
    const metadata = validMetadata();
    metadata.format.duration = "13.9";

    expect(() => validateShortMetadata(metadata as any, expected))
      .toThrow("duration 13.900s; expected 15.000s");
  });

  it("rejects a short with invalid/missing duration", () => {
    const metadata = validMetadata();
    metadata.format.duration = undefined as any;

    expect(() => validateShortMetadata(metadata as any, expected))
      .toThrow("duration NaN");
  });

  it("rejects a short with an incompatible video codec", () => {
    const metadata = validMetadata();
    metadata.streams[0]!.codec_name = "mpeg4";

    expect(() => validateShortMetadata(metadata as any, expected))
      .toThrow("video codec mpeg4; expected h264");
  });

  it("rejects a short with missing video codec", () => {
    const metadata = validMetadata();
    metadata.streams[0]!.codec_name = undefined as any;

    expect(() => validateShortMetadata(metadata as any, expected))
      .toThrow("video codec missing; expected h264");
  });

  it("rejects a short with an incompatible audio codec", () => {
    const metadata = validMetadata();
    metadata.streams[1]!.codec_name = "mp3";

    expect(() => validateShortMetadata(metadata as any, expected))
      .toThrow("audio codec mp3; expected aac");
  });

  it("rejects a short with missing audio codec", () => {
    const metadata = validMetadata();
    metadata.streams[1]!.codec_name = undefined as any;

    expect(() => validateShortMetadata(metadata as any, expected))
      .toThrow("audio codec missing; expected aac");
  });

  it("rejects a short rendered below the 30 fps target", () => {
    const metadata = validMetadata();
    metadata.streams[0]!.r_frame_rate = "24/1";

    expect(() => validateShortMetadata(metadata as any, expected))
      .toThrow("frame rate 24.000fps; expected 29-31fps");
  });

  it("rejects a short with missing frame rate", () => {
    const metadata = validMetadata();
    metadata.streams[0]!.r_frame_rate = undefined as any;

    expect(() => validateShortMetadata(metadata as any, expected))
      .toThrow("frame rate 0.000fps");
  });

  it("rejects a short with 0 denominator frame rate causing Infinity", () => {
    const metadata = validMetadata();
    metadata.streams[0]!.r_frame_rate = "30/0";

    expect(() => validateShortMetadata(metadata as any, expected))
      .toThrow("frame rate Infinityfps; expected 29-31fps");
  });

  it("probes the rendered file and accepts valid professional media", async () => {
    vi.mocked(execFile).mockImplementation((...args: any[]) => {
      args.at(-1)(null, { stdout: JSON.stringify(validMetadata()), stderr: "" });
      return {} as any;
    });

    await expect(assertShortMediaQuality("short.mp4", expected)).resolves.toBeUndefined();
    expect(execFile).toHaveBeenCalledWith(
      "ffprobe",
      expect.arrayContaining(["-of", "json", "short.mp4"]),
      expect.any(Object),
      expect.any(Function),
    );
  });
});
