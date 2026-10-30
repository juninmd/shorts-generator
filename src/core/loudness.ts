import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { DeliverySpec } from "./delivery-spec.js";
import { runFfmpeg } from "./ffmpeg-run.js";
import { probeFormat } from "./ffmpeg-bin.js";
import { logger } from "./logger.js";
import {
  buildLoudnormFilter,
  isWithinLoudnessSpec,
  parseLoudnormJson,
  type LoudnessMeasurement,
} from "./loudness-measure.js";

export * from "./loudness-measure.js";

/**
 * Two-pass loudness normalisation executed against a rendered file
 * (ffmpeg-skill `loudness.py`): the picture is stream-copied, only the audio is
 * re-encoded, and the written file is measured again so a codec overshoot is
 * caught instead of shipped.
 */

const MAX_ENCODES = 3;
const BITRATES_KBPS = [192, 256, 320] as const;

export interface LoudnessResult {
  normalized: boolean;
  lufs: number | null;
  tp: number | null;
  encodes: number;
  /** Why nothing was written: disabled, unmeasurable, already on target, or the failure. */
  reason?: string;
}

/** A measurement, or the reason it could not be taken (timeout, crash, no usable audio). */
export type LoudnessMeasurementResult =
  | { ok: true; measurement: LoudnessMeasurement }
  | { ok: false; reason: string };

/** Measure a file's integrated loudness and true peak; never throws, and says why when it fails. */
export async function measureLoudness(filePath: string, spec: DeliverySpec): Promise<LoudnessMeasurementResult> {
  try {
    const { stderr } = await runFfmpeg([
      "-nostats", "-i", filePath, "-vn",
      "-af", `loudnorm=I=${spec.lufs}:TP=${spec.truePeak}:LRA=11:print_format=json`,
      "-f", "null", "-",
    ], { maxBufferBytes: 8 * 1024 * 1024 });
    const measurement = parseLoudnormJson(stderr);
    return measurement ? { ok: true, measurement } : { ok: false, reason: "no_audio_or_silent" };
  } catch (error) {
    return { ok: false, reason: (error as Error).message };
  }
}

async function inputDuration(filePath: string): Promise<number | undefined> {
  try {
    const duration = Number.parseFloat(String((await probeFormat(filePath)).duration ?? ""));
    return Number.isFinite(duration) && duration > 0 ? duration : undefined;
  } catch {
    return undefined;
  }
}

async function encode(
  inputPath: string,
  outputPath: string,
  measurement: LoudnessMeasurement,
  spec: DeliverySpec,
  bitrateKbps: number,
  ceiling: number,
): Promise<void> {
  const durationSec = await inputDuration(inputPath);
  await runFfmpeg([
    "-y", "-i", inputPath,
    "-map", "0:v:0?", "-map", "0:a:0",
    "-c:v", "copy",
    "-af", buildLoudnormFilter(measurement, spec, ceiling, durationSec),
    "-c:a", "aac", "-b:a", `${bitrateKbps}k`, "-ar", String(spec.sampleRate), "-ac", "2",
    "-movflags", "+faststart",
    outputPath,
  ], { outputPath });
}

/** Normalise a rendered file through a sibling temp file, then verify the result. */
export async function normalizeLoudness(filePath: string, spec: DeliverySpec): Promise<LoudnessResult> {
  const skipped = (reason: string, encodes = 0): LoudnessResult =>
    ({ normalized: false, lufs: null, tp: null, encodes, reason });

  if (process.env.LOUDNESS_NORMALIZE === "false") return skipped("disabled");
  const first = await measureLoudness(filePath, spec);
  // A measurement that failed is not a file with no audio: the reason says which.
  if (!first.ok) return skipped(first.reason);
  const measurement = first.measurement;
  if (isWithinLoudnessSpec(measurement, spec)) {
    return { normalized: false, lufs: measurement.input_i, tp: measurement.input_tp, encodes: 0, reason: "on_target" };
  }

  const tempPath = path.join(
    path.dirname(filePath),
    `.${randomUUID()}${path.extname(filePath)}`,
  );
  let ceiling = spec.truePeak;
  let bitrateIndex = 0;
  let measured = measurement;
  let encodes = 0;
  try {
    while (encodes < MAX_ENCODES) {
      // Each pass re-measures the file it is about to replace: re-applying the original
      // gain to an already-normalised file would push it louder on every retry.
      await encode(filePath, tempPath, measured, spec, BITRATES_KBPS[bitrateIndex]!, ceiling);
      fs.renameSync(tempPath, filePath);
      encodes += 1;
      const after = await measureLoudness(filePath, spec);
      if (!after.ok) return { normalized: true, lufs: null, tp: null, encodes, reason: `unverified: ${after.reason}` };
      measured = after.measurement;
      if (isWithinLoudnessSpec(measured, spec)) break;
      // Encoder overshoot: more bits first, then a lower loudnorm ceiling.
      if (bitrateIndex + 1 < BITRATES_KBPS.length) bitrateIndex += 1;
      else ceiling -= Math.max(0, measured.input_tp - spec.truePeak) + 0.2;
    }
  } catch (error) {
    fs.rmSync(tempPath, { force: true });
    // A pass already replaced the file: report what it measured, not "no measurement".
    return {
      normalized: encodes > 0,
      lufs: measured.input_i,
      tp: measured.input_tp,
      encodes,
      reason: (error as Error).message,
    };
  }

  logger.info(
    { lufs: measured.input_i, tp: measured.input_tp, target: spec.lufs, encodes },
    "Loudness normalised to the delivery target",
  );
  return { normalized: true, lufs: measured.input_i, tp: measured.input_tp, encodes };
}
