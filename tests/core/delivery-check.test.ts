import { describe, expect, it } from "vitest";
import {
  checkDelivery,
  deliveryWarnings,
  firstFailure,
  type ProbeMetadata,
} from "../../src/core/delivery-check.js";
import { DELIVERY_SPECS } from "../../src/core/delivery-spec.js";

const spec = DELIVERY_SPECS.shorts!;
const expected = { duration: 15, width: 1080, height: 1920 };

const valid = (): ProbeMetadata => ({
  format: { duration: "15" },
  streams: [
    { codec_type: "video", codec_name: "h264", width: 1080, height: 1920, r_frame_rate: "30/1", pix_fmt: "yuv420p" },
    { codec_type: "audio", codec_name: "aac", sample_rate: "48000", channels: 2 },
  ],
});

const rows = (metadata: ProbeMetadata) => checkDelivery(metadata, expected, spec);

describe("delivery check", () => {
  it("passes a standard vertical delivery with no warnings", () => {
    const result = rows(valid());
    expect(firstFailure(result)).toBeUndefined();
    expect(deliveryWarnings(result)).toEqual([]);
    expect(result.every((entry) => entry.ok)).toBe(true);
  });

  it("fails a file that is not vertical", () => {
    const metadata = valid();
    metadata.streams![0]!.width = 1920;
    expect(firstFailure(rows(metadata))?.message).toBe("Short media quality failed: resolution 1920x1920; expected 1080x1920");
  });

  it("fails the wrong video codec", () => {
    const metadata = valid();
    metadata.streams![0]!.codec_name = "mpeg4";
    expect(firstFailure(rows(metadata))?.message).toContain("video codec mpeg4; expected h264");
  });

  it("fails an unexpected frame rate", () => {
    const metadata = valid();
    metadata.streams![0]!.r_frame_rate = "24/1";
    expect(firstFailure(rows(metadata))?.message).toBe("Short media quality failed: frame rate 24.000fps; expected 29-31fps");
  });

  it("fails a file without audio, or with a non-AAC track", () => {
    const metadata = valid();
    metadata.streams = metadata.streams!.filter((stream) => stream.codec_type !== "audio");
    expect(firstFailure(rows(metadata))?.message).toBe("Short media quality failed: audio stream missing");

    const mp3 = valid();
    mp3.streams![1]!.codec_name = "mp3";
    expect(firstFailure(rows(mp3))?.message).toBe("Short media quality failed: audio codec mp3; expected aac");
  });

  it("fails a 44.1 kHz track: deliveries are 48 kHz", () => {
    const metadata = valid();
    metadata.streams![1]!.sample_rate = "44100";
    expect(firstFailure(rows(metadata))?.message).toBe(
      "Short media quality failed: audio sample rate 44100Hz; expected 48000Hz",
    );
  });

  it("fails duration drift and a missing duration", () => {
    const drifted = valid();
    drifted.format!.duration = "13.9";
    expect(firstFailure(rows(drifted))?.message).toBe("Short media quality failed: duration 13.900s; expected 15.000s");

    const missing = valid();
    missing.format!.duration = undefined;
    expect(firstFailure(rows(missing))?.message).toBe("Short media quality failed: duration NaNs; expected 15.000s");
  });

  it("allows a wider drift for multi-chapter narrations", () => {
    const metadata = valid();
    metadata.format!.duration = "16.5";
    expect(firstFailure(checkDelivery(metadata, expected, spec))).toBeDefined();
    expect(firstFailure(checkDelivery(metadata, expected, DELIVERY_SPECS.custom!))).toBeUndefined();
  });

  it("fails a file longer than the destination accepts", () => {
    const metadata = valid();
    metadata.format!.duration = "200";
    const long = checkDelivery(metadata, { ...expected, duration: 200 }, spec);
    expect(firstFailure(long)?.message).toBe(
      "Short media quality failed: duration 200.000s exceeds the shorts maximum of 180s",
    );
    expect(firstFailure(checkDelivery(metadata, { ...expected, duration: 200 }, { ...spec, maxDuration: 600 }))).toBeUndefined();
  });

  it("warns about a pixel format and colour tags that are not standard", () => {
    const metadata = valid();
    metadata.streams![0]!.pix_fmt = "yuv444p";
    metadata.streams![0]!.color_space = "smpte170m";
    metadata.streams![0]!.color_primaries = "smpte170m";
    metadata.streams![0]!.color_transfer = "smpte170m";
    const result = rows(metadata);
    expect(firstFailure(result)).toBeUndefined();
    expect(deliveryWarnings(result).map((entry) => entry.property)).toEqual(["pixel_format", "color_tags"]);
    expect(deliveryWarnings(result)[0]!.message).toContain("pixel format yuv444p");
    expect(deliveryWarnings(result)[1]!.message).toContain("smpte170m");
  });

  it("warns when the video profile is not High", () => {
    const metadata = valid();
    metadata.streams![0]!.profile = "Main";
    expect(deliveryWarnings(rows(metadata))).toEqual([
      expect.objectContaining({ property: "profile", message: expect.stringContaining("Main") }),
    ]);
    metadata.streams![0]!.profile = "High";
    expect(deliveryWarnings(rows(metadata))).toEqual([]);
  });

  it("does not warn about a tag ffmpeg never wrote", () => {
    const metadata = valid();
    metadata.streams![0]!.color_space = "unknown";
    metadata.streams![0]!.color_primaries = "unknown";
    metadata.streams![0]!.color_transfer = "unknown";
    expect(deliveryWarnings(rows(metadata))).toEqual([]);
  });

  it("warns about a mono delivery", () => {
    const metadata = valid();
    metadata.streams![1]!.channels = 1;
    const result = rows(metadata);
    expect(firstFailure(result)).toBeUndefined();
    expect(deliveryWarnings(result)).toEqual([
      expect.objectContaining({ property: "channels", message: "Short delivery warning: audio has 1 channel(s); deliveries expect stereo" }),
    ]);
  });

  it("reports missing picture metadata as a failure instead of a crash", () => {
    const audioOnly = rows({
      format: { duration: "15" },
      streams: [{ codec_type: "audio", codec_name: "aac", sample_rate: "48000" }],
    });
    expect(firstFailure(audioOnly)?.message).toBe("Short media quality failed: resolution 0x0; expected 1080x1920");

    const bare = valid();
    delete bare.streams![0]!.pix_fmt;
    expect(deliveryWarnings(rows(bare))).toEqual([]);
  });
});
