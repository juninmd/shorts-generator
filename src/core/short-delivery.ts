import { activeDeliverySpec, type DeliverySpec } from "./delivery-spec.js";
import { normalizeLoudness, TP_TOLERANCE_DB, type LoudnessResult } from "./loudness.js";
import { assertShortMediaQuality } from "./short-quality.js";
import type { ExpectedMedia } from "./delivery-check.js";
import { logger } from "./logger.js";

/**
 * Last step of a render (ffmpeg-skill `export.py --normalize` + `check.py`):
 * bring the audio onto the destination's loudness target, then verify the
 * written file against the destination's spec before anything uploads.
 */
export interface DeliveryReport {
  destination: string;
  loudness: LoudnessResult;
  /** null when the levels could not be measured (no audio, silent, unmeasurable). */
  loudnessOk: boolean | null;
  normalized: boolean;
  warnings: string[];
}

function loudnessVerdict(loudness: LoudnessResult, spec: DeliverySpec): boolean | null {
  if (loudness.lufs === null || loudness.tp === null) return null;
  return Math.abs(loudness.lufs - spec.lufs) <= spec.lufsTolerance
    && loudness.tp <= spec.truePeak + TP_TOLERANCE_DB;
}

export async function finishDelivery(
  filePath: string,
  expected: ExpectedMedia,
  spec: DeliverySpec = activeDeliverySpec(),
): Promise<DeliveryReport> {
  const loudness = await normalizeLoudness(filePath, spec);
  const loudnessOk = loudnessVerdict(loudness, spec);
  const warnings: string[] = [];
  // A failed pass must not disappear behind a level that happens to be within tolerance.
  const reason = loudness.reason?.slice(0, 200);
  const failedPass = Boolean(reason) && reason !== "on_target" && reason !== "disabled";

  if (loudnessOk === false) {
    warnings.push(
      `loudness ${loudness.lufs!.toFixed(1)} LUFS / ${loudness.tp!.toFixed(1)} dBTP is outside `
      + `${spec.name}'s ${spec.lufs} LUFS / ${spec.truePeak} dBTP`,
    );
  }
  if (failedPass) {
    const prefix = loudnessOk === null ? "loudness not measured" : "loudness pass did not complete";
    warnings.push(`${prefix} for ${spec.name}: ${reason}`);
  } else if (loudnessOk === null && reason !== "disabled") {
    warnings.push(`loudness not measured for ${spec.name} (${reason ?? "unknown"})`);
  }
  for (const warning of warnings) logger.warn({ file: filePath, destination: spec.name }, warning);

  await assertShortMediaQuality(filePath, expected, spec);
  logger.info(
    {
      destination: spec.name,
      normalized: loudness.normalized,
      encodes: loudness.encodes,
      lufs: loudness.lufs,
      tp: loudness.tp,
      reason,
    },
    loudness.lufs === null ? "Delivery verified without a loudness measurement" : "Delivery verified",
  );
  return { destination: spec.name, loudness, loudnessOk, normalized: loudness.normalized, warnings };
}
