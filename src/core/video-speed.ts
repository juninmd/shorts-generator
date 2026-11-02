import fs from "node:fs";
import type { PipelineConfig } from "../types.js";
import type { DeliverySpec } from "./delivery-spec.js";
import { buildAudioEncoderArgs, buildVideoEncoderArgs } from "./encode-settings.js";
import { runFfmpeg } from "./ffmpeg-run.js";

export const MIN_SPEED = 1;
export const MAX_SPEED = 2;

/** VIDEO_SPEED between 1x and 2x (default 1x); invalid or sub-1.01 values mean normal speed. */
export function videoSpeed(): number {
  const speed = Number(process.env.VIDEO_SPEED);
  if (!Number.isFinite(speed) || speed < 1.01) return MIN_SPEED;
  return Math.min(speed, MAX_SPEED);
}

/**
 * Speeds up the finished short in place. Captions are burned into the picture, so they stay in
 * sync by construction; atempo keeps the voice pitch; the frame rate is reset to the delivery fps.
 */
export async function applySpeed(
  outputPath: string,
  speed: number,
  config: PipelineConfig,
  spec: DeliverySpec,
): Promise<void> {
  const sped = outputPath.replace(/(\.mp4)?$/, ".speed.mp4");
  await runFfmpeg([
    "-i", outputPath, "-y",
    "-filter_complex", `[0:v]setpts=PTS/${speed},fps=${spec.fps}[v];[0:a]atempo=${speed}[a]`,
    "-map", "[v]", "-map", "[a]",
    ...buildVideoEncoderArgs({ encoder: config.videoEncoder, spec, tagBt709: true }),
    ...buildAudioEncoderArgs(spec),
    "-movflags", "+faststart",
    sped,
  ], { outputPath: sped });
  fs.renameSync(sped, outputPath);
}
