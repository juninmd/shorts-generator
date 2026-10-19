import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { PipelineConfig, ShortClip } from "../types.js";
import { logger } from "./logger.js";
import { CENTER_FOCUS, buildCropXExpression, resolveSpeakerFocus } from "./face-framing.js";
import type { FocusKeyframe } from "./focus-keyframes.js";
import { buildAudioRouting, pickBackgroundMusic } from "./audio-ducking.js";
import { assertShortMediaQuality } from "./short-quality.js";

const execFileAsync = promisify(execFile);

function escapeFilterPath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/:/g, "\\:");
}

import { buildFontEnv } from "./ffmpeg-env.js";
import { ffmpegBin } from "./ffmpeg-bin.js";

export function buildSafeFramingFilter(
  subtitlePath: string,
  width: number,
  height: number,
  logoPath?: string | null,
  focus: number | FocusKeyframe[] = CENTER_FOCUS,
): string {
  const assPath = escapeFilterPath(subtitlePath);
  // Horizontal crop offset biased toward the speaker (a fixed 0..1 position or
  // tracked keyframes that pan between speakers); clamped to stay inside the frame.
  const cropX = buildCropXExpression(width, focus);
  // Gentle "breathing" punch-in (up to +7% over an 8s cycle): constant subtle
  // motion counters the static-pulpit retention drop without distracting from
  // the speaker. Applied before subtitles so caption text stays fixed.
  const punchIn = `scale=w='ceil(iw*(1+0.07*pow(sin(PI*t/8),2))/2)*2':h=-2:eval=frame:flags=lanczos,crop=${width}:${height}:(in_w-${width})/2:(in_h-${height})/2`;
  const baseVideo = `[0:v]scale=w='if(gt(iw/ih,${width}/${height}),-1,${width})':h='if(gt(iw/ih,${width}/${height}),${height},-1)':flags=lanczos+accurate_rnd,crop=${width}:${height}:${cropX}:(in_h-${height})/2,${punchIn},hqdn3d=1.5:1.5:3:3,unsharp=3:3:0.5:3:3:0.5,setsar=1,ass='${assPath}'[base]`;
  if (!logoPath) {
    return `${baseVideo};[base]copy[v]`;
  }
  return `${baseVideo};[1:v]scale=180:-1[logo];[base][logo]overlay=W-w-36:36[v]`;
}

export async function renderShort(
  inputPath: string,
  outputPath: string,
  subtitlePath: string,
  clip: ShortClip,
  config: PipelineConfig,
): Promise<void> {
  const logoPath = config.managedRun?.logoPath && fs.existsSync(config.managedRun.logoPath)
    ? config.managedRun.logoPath
    : null;
  const focus = await resolveSpeakerFocus(inputPath, clip);
  const filter = buildSafeFramingFilter(
    subtitlePath,
    config.verticalWidth,
    config.verticalHeight,
    logoPath,
    focus,
  );
  const audio = buildAudioRouting(clip.duration, pickBackgroundMusic(), logoPath ? 2 : 1);
  const isNvenc = config.videoEncoder.includes("nvenc");
  const qualityArgs = isNvenc ? ["-cq", "18"] : ["-crf", "18"];
  const args = [
    "-ss", String(clip.startTime),
    "-i", inputPath,
    ...(logoPath ? ["-i", logoPath] : []),
    ...audio.inputArgs,
    "-y",
    "-filter_complex", audio.graph ? `${filter};${audio.graph}` : filter,
    "-map", "[v]",
    ...audio.outputArgs,
    "-t", String(clip.duration),
    "-c:v", config.videoEncoder,
    "-preset", isNvenc ? "p7" : "slow",
    ...qualityArgs,
    "-profile:v", "high",
    "-level", "4.1",
    "-c:a", "aac",
    "-b:a", "256k",
    "-ar", "44100",
    "-movflags", "+faststart",
    "-pix_fmt", "yuv420p",
    "-r", "30",
    outputPath,
  ];
  await runFfmpeg(args, outputPath);
  await assertShortMediaQuality(outputPath, {
    duration: clip.duration,
    width: config.verticalWidth,
    height: config.verticalHeight,
  });
}

async function runFfmpeg(args: string[], outputPath: string): Promise<void> {
  const bin = ffmpegBin();
  logger.debug({ command: [bin, ...args].join(" ") }, "FFmpeg started");
  try {
    const { stderr } = await execFileAsync(bin, args, {
      env: buildFontEnv(),
      maxBuffer: 100 * 1024 * 1024,
    });
    if (stderr) logger.debug({ stderr }, "FFmpeg stderr (informational)");
    verifyOutput(outputPath);
  } catch (err: any) {
    logger.error(
      { err, stderr: err.stderr, stdout: err.stdout, command: [bin, ...args].join(" ") },
      "FFmpeg CRASHED! O vídeo gerado provavelmente está corrompido ou vazio.",
    );
    throw new Error(`FFmpeg failed to render short: ${err.message}`);
  }
}

function verifyOutput(outputPath: string): void {
  if (!fs.existsSync(outputPath)) {
    throw new Error(`FFmpeg finished but output file is missing: ${outputPath}`);
  }
  const stats = fs.statSync(outputPath);
  if (stats.size < 100 * 1024) {
    throw new Error(
      `FFmpeg output is too small (${(stats.size / 1024).toFixed(1)}KB). Video is likely corrupted.`,
    );
  }
  logger.debug({ outputPath, size: stats.size }, "Video integrity verified");
}
