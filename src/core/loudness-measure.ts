import type { DeliverySpec } from "./delivery-spec.js";

/**
 * Pure parts of EBU R128 normalisation (ffmpeg-skill `loudness.py`): reading
 * `loudnorm`'s JSON measurement, building the pass-2 filter from it, and
 * deciding whether a file already meets the destination's targets.
 */

/** True-peak measurement noise tolerated before a file counts as out of spec. */
export const TP_TOLERANCE_DB = 0.1;
/** Integrated-loudness distance from the target that still counts as on target. */
export const LUFS_TOLERANCE = 1;

export interface LoudnessMeasurement {
  input_i: number;
  input_tp: number;
  input_lra: number;
  input_thresh: number;
  target_offset: number;
}

/** `loudnorm`'s JSON block from stderr; null when it is missing or holds `-inf` (silence). */
export function parseLoudnormJson(stderr: string): LoudnessMeasurement | null {
  const match = stderr.match(/\{[^{}]*"input_i"[^{}]*\}/s);
  if (!match) return null;
  try {
    const data = JSON.parse(match[0]) as Record<string, string>;
    const measurement: LoudnessMeasurement = {
      input_i: Number(data.input_i),
      input_tp: Number(data.input_tp),
      input_lra: Number(data.input_lra),
      input_thresh: Number(data.input_thresh),
      target_offset: Number(data.target_offset),
    };
    return Object.values(measurement).every(Number.isFinite) ? measurement : null;
  } catch {
    return null;
  }
}

/** Pass-2 filter: linear gain from the measurements, trimmed back to the input's own length. */
export function buildLoudnormFilter(
  measurement: LoudnessMeasurement,
  spec: DeliverySpec,
  ceiling = spec.truePeak,
  durationSec?: number,
): string {
  const filter = [
    `loudnorm=I=${spec.lufs}:TP=${ceiling}:LRA=11`,
    `measured_I=${measurement.input_i}:measured_TP=${measurement.input_tp}`,
    `measured_LRA=${measurement.input_lra}:measured_thresh=${measurement.input_thresh}`,
    `offset=${measurement.target_offset}:linear=true:print_format=summary`,
  ].join(":");
  // loudnorm emits its last block whole; without the trim the AAC encode can run long.
  return durationSec && Number.isFinite(durationSec) ? `${filter},atrim=duration=${durationSec.toFixed(3)}` : filter;
}

/** True when a measured file already meets the destination's loudness and peak ceiling. */
export function isWithinLoudnessSpec(measurement: LoudnessMeasurement, spec: DeliverySpec): boolean {
  return Math.abs(measurement.input_i - spec.lufs) <= LUFS_TOLERANCE
    && measurement.input_tp <= spec.truePeak + TP_TOLERANCE_DB;
}
