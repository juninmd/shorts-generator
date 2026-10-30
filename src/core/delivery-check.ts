import type { DeliverySpec } from "./delivery-spec.js";

/**
 * Delivery compliance rows (ffmpeg-skill `check.py`): every measured property is
 * compared with the destination's spec, and the failures carry the same message
 * the renderer has always thrown, with the platform limits added as warnings so
 * a file that plays but breaks a destination rule is logged, not silently shipped.
 */

export interface ProbeStream {
  codec_type?: string;
  codec_name?: string;
  profile?: string;
  width?: number;
  height?: number;
  pix_fmt?: string;
  r_frame_rate?: string;
  sample_rate?: string;
  channels?: number;
  color_space?: string;
  color_transfer?: string;
  color_primaries?: string;
}

export interface ProbeMetadata {
  format?: { duration?: string | number };
  streams?: ProbeStream[];
}

export interface ExpectedMedia {
  duration: number;
  width: number;
  height: number;
}

export type DeliverySeverity = "fail" | "warn";

export interface DeliveryRow {
  property: string;
  ok: boolean;
  severity: DeliverySeverity;
  message: string;
}

/** A delivery may be one frame off the declared rate (container rounding). */
const FPS_TOLERANCE = 1;

const row = (property: string, ok: boolean, severity: DeliverySeverity, message: string): DeliveryRow =>
  ({ property, ok, severity, message });

const warn = (property: string, ok: boolean, message: string): DeliveryRow => row(property, ok, "warn", message);

/** All measured properties of a rendered short, compared with one destination spec. */
export function checkDelivery(
  metadata: ProbeMetadata,
  expected: ExpectedMedia,
  spec: DeliverySpec,
): DeliveryRow[] {
  const video = metadata.streams?.find((stream) => stream.codec_type === "video");
  const audio = metadata.streams?.find((stream) => stream.codec_type === "audio");
  const [rateNumerator, rateDenominator = "1"] = (video?.r_frame_rate ?? "").split("/");
  const frameRate = Number(rateNumerator) / Number(rateDenominator);
  const duration = Number(metadata.format?.duration);

  const rows: DeliveryRow[] = [
    row(
      "resolution",
      video?.width === expected.width && video.height === expected.height,
      "fail",
      `Short media quality failed: resolution ${video?.width ?? 0}x${video?.height ?? 0}; `
        + `expected ${expected.width}x${expected.height}`,
    ),
    row(
      "video_codec",
      video?.codec_name === spec.videoCodec,
      "fail",
      `Short media quality failed: video codec ${video?.codec_name ?? "missing"}; expected ${spec.videoCodec}`,
    ),
    row(
      "frame_rate",
      Number.isFinite(frameRate) && Math.abs(frameRate - spec.fps) <= FPS_TOLERANCE,
      "fail",
      `Short media quality failed: frame rate ${frameRate.toFixed(3)}fps; `
        + `expected ${spec.fps - FPS_TOLERANCE}-${spec.fps + FPS_TOLERANCE}fps`,
    ),
    row("audio_stream", Boolean(audio), "fail", "Short media quality failed: audio stream missing"),
    row(
      "audio_codec",
      audio?.codec_name === spec.audioCodec,
      "fail",
      `Short media quality failed: audio codec ${audio?.codec_name ?? "missing"}; expected ${spec.audioCodec}`,
    ),
    row(
      "audio_sample_rate",
      Number(audio?.sample_rate) === spec.sampleRate,
      "fail",
      `Short media quality failed: audio sample rate ${audio?.sample_rate ?? "missing"}Hz; expected ${spec.sampleRate}Hz`,
    ),
    row(
      "duration",
      Number.isFinite(duration) && Math.abs(duration - expected.duration) <= spec.durationTolerance,
      "fail",
      `Short media quality failed: duration ${duration.toFixed(3)}s; expected ${expected.duration.toFixed(3)}s`,
    ),
    row(
      "max_duration",
      Number(duration) <= spec.maxDuration,
      "fail",
      `Short media quality failed: duration ${duration.toFixed(3)}s exceeds the ${spec.name} maximum of ${spec.maxDuration}s`,
    ),
    warn(
      "pixel_format",
      video?.pix_fmt === undefined || video.pix_fmt === "yuv420p",
      `Short delivery warning: pixel format ${video?.pix_fmt ?? "missing"}; deliveries expect yuv420p`,
    ),
    warn(
      "color_tags",
      [video?.color_space, video?.color_primaries, video?.color_transfer]
        .every((tag) => tag === undefined || tag === "unknown" || tag === "bt709"),
      `Short delivery warning: colour tags ${video?.color_space ?? "-"}/${video?.color_primaries ?? "-"}/`
        + `${video?.color_transfer ?? "-"}; deliveries expect bt709`,
    ),
    warn(
      "channels",
      audio?.channels === 2,
      `Short delivery warning: audio has ${audio?.channels ?? 0} channel(s); deliveries expect stereo`,
    ),
    warn(
      "profile",
      video?.profile === undefined || /high/i.test(video.profile),
      `Short delivery warning: video profile ${video?.profile ?? "missing"}; deliveries expect ${spec.videoCodec} High`,
    ),
  ];
  return rows;
}

/** The first row that must stop the render, or undefined when the file is deliverable. */
export function firstFailure(rows: DeliveryRow[]): DeliveryRow | undefined {
  return rows.find((entry) => entry.severity === "fail" && !entry.ok);
}

/** Rows that do not block delivery but make the file non-standard for its destination. */
export function deliveryWarnings(rows: DeliveryRow[]): DeliveryRow[] {
  return rows.filter((entry) => entry.severity === "warn" && !entry.ok);
}
