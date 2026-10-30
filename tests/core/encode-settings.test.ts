import { describe, expect, it } from "vitest";
import {
  AUDIO_SAMPLE_RATE,
  BT709_TAGS,
  buildAudioEncoderArgs,
  buildBt709Filter,
  buildVideoEncoderArgs,
  isNvenc,
  needsBt709Conversion,
} from "../../src/core/encode-settings.js";
import { DELIVERY_SPECS } from "../../src/core/delivery-spec.js";

const spec = DELIVERY_SPECS.shorts!;

describe("encode settings", () => {
  it("tags every delivery BT.709 and caps the bitrate", () => {
    const args = buildVideoEncoderArgs({ encoder: "libx264", spec });
    expect(args).toEqual(expect.arrayContaining(["-c:v", "libx264", "-preset", "slow", "-crf", "18"]));
    expect(args).toEqual(expect.arrayContaining(["-profile:v", "high", "-level", "4.1", "-pix_fmt", "yuv420p"]));
    expect(args).toEqual(expect.arrayContaining(["-r", "30", "-g", "60"]));
    expect(args).toEqual(expect.arrayContaining(["-maxrate", "12M", "-bufsize", "24M"]));
    expect(args).toEqual(expect.arrayContaining([...BT709_TAGS]));
    expect(args).toEqual(expect.arrayContaining(["-keyint_min", "60", "-sc_threshold", "0"]));
  });

  it("tags libx264's VUI, which the generic colour options do not reach", () => {
    expect(buildVideoEncoderArgs({ encoder: "libx264", spec })).toEqual(
      expect.arrayContaining(["-x264-params", "colorprim=bt709:transfer=bt709:colormatrix=bt709"]),
    );
    expect(buildVideoEncoderArgs({ encoder: "libx265", spec })).toEqual(
      expect.arrayContaining(["-x265-params", "colorprim=bt709:transfer=bt709:colormatrix=bt709"]),
    );
    expect(buildVideoEncoderArgs({ encoder: "h264_nvenc", spec })).not.toContain("-x264-params");
    expect(buildVideoEncoderArgs({ encoder: "mpeg4", spec })).not.toContain("-x264-params");
  });

  it("keeps NVENC's options and skips the x264-only ones", () => {
    const args = buildVideoEncoderArgs({ encoder: "h264_nvenc", spec, quality: 20 });
    expect(args).toEqual(expect.arrayContaining(["-preset", "p7", "-cq", "20"]));
    expect(args).toEqual(expect.arrayContaining(["-maxrate", "14M"]));
    expect(args).not.toContain("-crf");
    expect(args).not.toContain("-keyint_min");
    expect(args).not.toContain("-sc_threshold");
  });

  it("recognises the NVENC family", () => {
    expect(isNvenc("h264_nvenc")).toBe(true);
    expect(isNvenc("hevc_nvenc")).toBe(true);
    expect(isNvenc("libx264")).toBe(false);
  });

  it("converts only a BT.601 source instead of relabelling it", () => {
    for (const space of ["smpte170m", "bt470bg", "smpte240m", "bt601", "SMPTE170M"]) {
      expect(needsBt709Conversion(space)).toBe(true);
    }
    expect(needsBt709Conversion("bt709")).toBe(false);
    expect(needsBt709Conversion(undefined)).toBe(false);
    expect(needsBt709Conversion(null)).toBe(false);
    expect(needsBt709Conversion("")).toBe(false);
    expect(buildBt709Filter("smpte170m")).toBe("colorspace=all=bt709:iall=bt601-6-625:fast=1,");
    expect(buildBt709Filter("bt709")).toBe("");
  });

  it("encodes audio at the platform's sample rate and stereo layout", () => {
    expect(buildAudioEncoderArgs(spec)).toEqual(["-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2"]);
    expect(buildAudioEncoderArgs(spec, 128)).toEqual(["-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2"]);
    expect(AUDIO_SAMPLE_RATE).toBe(48000);
  });
});
