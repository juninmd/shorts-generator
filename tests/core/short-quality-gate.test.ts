import { describe, expect, it, vi, beforeEach } from "vitest";
import { execFile } from "node:child_process";
import { assertShortMediaQuality, validateShortMetadata } from "../../src/core/short-quality.js";
import { DELIVERY_SPECS } from "../../src/core/delivery-spec.js";
import { logger } from "../../src/core/logger.js";

vi.mock("node:child_process", () => ({ execFile: vi.fn() }));
vi.mock("../../src/core/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const expected = { duration: 15, width: 1080, height: 1920 };
const validMetadata = () => ({
  format: { duration: "15" },
  streams: [
    { codec_type: "video", codec_name: "h264", width: 1080, height: 1920, r_frame_rate: "30/1", pix_fmt: "yuv420p" },
    { codec_type: "audio", codec_name: "aac", sample_rate: "48000", channels: 2 },
  ],
});

const probeReturns = (metadata: unknown) => {
  vi.mocked(execFile).mockImplementation((...args: any[]) => {
    args.at(-1)(null, { stdout: JSON.stringify(metadata), stderr: "" });
    return {} as any;
  });
};

describe("destination-specific delivery gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a 44.1 kHz track: platform deliveries are 48 kHz", () => {
    const metadata = validMetadata();
    metadata.streams[1]!.sample_rate = "44100";

    expect(() => validateShortMetadata(metadata as any, expected))
      .toThrow("audio sample rate 44100Hz; expected 48000Hz");
  });

  it("rejects a short longer than the destination accepts", () => {
    const metadata = validMetadata();
    metadata.format.duration = "120";

    expect(() => validateShortMetadata(metadata as any, { ...expected, duration: 120 }, DELIVERY_SPECS.reels!))
      .toThrow("duration 120.000s exceeds the reels maximum of 90s");
  });

  it("logs non-standard pixel format and colour tags without blocking delivery", async () => {
    const metadata = validMetadata() as any;
    metadata.streams[0].pix_fmt = "yuv444p";
    metadata.streams[0].color_space = "smpte170m";
    probeReturns(metadata);

    await expect(assertShortMediaQuality("short.mp4", expected)).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ property: "pixel_format", destination: "shorts" }),
      expect.stringContaining("yuv444p"),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ property: "color_tags" }),
      expect.stringContaining("smpte170m"),
    );
  });

  it("warns about mono audio but still delivers", async () => {
    const metadata = validMetadata() as any;
    metadata.streams[1].channels = 1;
    probeReturns(metadata);

    await expect(assertShortMediaQuality("short.mp4", expected)).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ property: "channels" }),
      expect.stringContaining("1 channel(s)"),
    );
  });
});
