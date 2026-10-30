import type { DeliverySpec } from "./delivery-spec.js";

/**
 * Encoder and colour settings for a platform delivery, following ffmpeg-skill's
 * `export.py` (`bt709_tag_args` / `bt709_matrix_args` / `cfa_args`): every
 * delivery is tagged BT.709, a BT.601 source is converted to match instead of
 * being mislabelled, and a fixed 2 s GOP keeps the upload seekable.
 */

/** Colour metadata written with every SDR delivery. */
export const BT709_TAGS = [
  "-colorspace", "bt709",
  "-color_primaries", "bt709",
  "-color_trc", "bt709",
] as const;

/** Video deliveries are 48 kHz; 44.1 kHz is a CD rate, not a platform rate. */
export const AUDIO_SAMPLE_RATE = 48000;

/** Source colour spaces that mean BT.601 and therefore need a real matrix conversion. */
const BT601_SPACES = new Set(["smpte170m", "bt470bg", "smpte240m", "bt601"]);

/** True when the source's matrix is BT.601 and its pixels must be converted, not just relabelled. */
export function needsBt709Conversion(colorSpace?: string | null): boolean {
  return BT601_SPACES.has((colorSpace ?? "").trim().toLowerCase());
}

/** Filter that converts a BT.601 source to BT.709; "" when only tagging is needed. */
export function buildBt709Filter(colorSpace?: string | null): string {
  return needsBt709Conversion(colorSpace)
    ? "colorspace=all=bt709:iall=bt601-6-625:fast=1,"
    : "";
}

export function isNvenc(encoder: string): boolean {
  return encoder.includes("nvenc");
}

/**
 * H.264/HEVC write their colour description in the SPS VUI, not from the generic
 * `-color_*` options (this build drops those: ffprobe reads `unknown`). libx264/x265
 * need the params line to actually tag the delivery BT.709.
 */
function colorVuiArgs(encoder: string): string[] {
  if (encoder.startsWith("libx264")) return ["-x264-params", "colorprim=bt709:transfer=bt709:colormatrix=bt709"];
  if (encoder.startsWith("libx265")) return ["-x265-params", "colorprim=bt709:transfer=bt709:colormatrix=bt709"];
  return [];
}

/** Bits per second cap so a CRF encode of a still frame never spikes past the platform's ceiling. */
function maxRate(encoder: string): string {
  return isNvenc(encoder) ? "14M" : "12M";
}

export interface VideoEncodeOptions {
  encoder: string;
  spec: DeliverySpec;
  /** Constant-quality value; x264 CRF or NVENC CQ. */
  quality?: number;
}

/** `-c:v` line for a vertical delivery: quality, profile, GOP, frame rate and a bitrate cap. */
export function buildVideoEncoderArgs(options: VideoEncodeOptions): string[] {
  const { encoder, spec } = options;
  const quality = options.quality ?? 18;
  const gop = String(spec.fps * 2);
  const args = [
    "-c:v", encoder,
    ...(isNvenc(encoder) ? ["-preset", "p7", "-cq", String(quality)] : ["-preset", "slow", "-crf", String(quality)]),
    "-profile:v", "high",
    "-level", "4.1",
    "-pix_fmt", "yuv420p",
    "-r", String(spec.fps),
    "-g", gop,
    "-maxrate", maxRate(encoder),
    "-bufsize", "24M",
    ...BT709_TAGS,
    ...colorVuiArgs(encoder),
  ];
  // sc_threshold/keyint_min are x264 private options; NVENC rejects unknown private flags.
  if (!isNvenc(encoder)) {
    args.push("-keyint_min", gop, "-sc_threshold", "0");
  }
  return args;
}

/** `-c:a` line at the platform's sample rate and channel layout. */
export function buildAudioEncoderArgs(spec: DeliverySpec, bitrateKbps = 192): string[] {
  return ["-c:a", "aac", "-b:a", `${bitrateKbps}k`, "-ar", String(spec.sampleRate), "-ac", "2"];
}
