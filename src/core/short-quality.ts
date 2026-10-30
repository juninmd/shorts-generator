import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  checkDelivery,
  deliveryWarnings,
  firstFailure,
  type ExpectedMedia,
  type ProbeMetadata,
} from "./delivery-check.js";
import { activeDeliverySpec, type DeliverySpec } from "./delivery-spec.js";
import { ffprobeBin } from "./ffmpeg-bin.js";
import { logger } from "./logger.js";

const execFileAsync = promisify(execFile);

export type ShortProbeMetadata = ProbeMetadata;

/** ffprobe fields the delivery gate reads; one probe answers every row. */
const PROBE_ENTRIES = [
  "codec_type", "codec_name", "profile", "width", "height", "pix_fmt", "r_frame_rate",
  "sample_rate", "channels", "color_space", "color_transfer", "color_primaries",
].join(",");

/** Probe a rendered file once and return every property the delivery gate checks. */
export async function probeRenderedShort(filePath: string): Promise<ProbeMetadata> {
  const { stdout } = await execFileAsync(ffprobeBin(), [
    "-v", "error",
    "-show_entries", `format=duration:stream=${PROBE_ENTRIES}`,
    "-of", "json",
    filePath,
  ], { maxBuffer: 1024 * 1024 });
  return JSON.parse(stdout) as ProbeMetadata;
}

/**
 * Throw when the file cannot be delivered, and log the properties that are
 * playable but non-standard for the destination (pixel format, colour tags).
 */
export function validateShortMetadata(
  metadata: ProbeMetadata,
  expected: ExpectedMedia,
  spec: DeliverySpec = activeDeliverySpec(),
): void {
  const rows = checkDelivery(metadata, expected, spec);
  const failure = firstFailure(rows);
  if (failure) throw new Error(failure.message);
  for (const warning of deliveryWarnings(rows)) {
    logger.warn({ property: warning.property, destination: spec.name }, warning.message);
  }
}

/** Probe the rendered short and apply the delivery gate. */
export async function assertShortMediaQuality(
  filePath: string,
  expected: ExpectedMedia,
  spec: DeliverySpec = activeDeliverySpec(),
): Promise<void> {
  validateShortMetadata(await probeRenderedShort(filePath), expected, spec);
}
