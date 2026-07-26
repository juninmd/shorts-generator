import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import ffmpeg from "fluent-ffmpeg";
import type { PipelineConfig, ShortClip } from "../types.js";
import { logger } from "./logger.js";
import { CENTER_FOCUS, detectSpeakerFocusX } from "./face-framing.js";
import { buildSpeechAudioFilter } from "./audio-polish.js";
import { assertShortMediaQuality } from "./short-quality.js";

const execFileAsync = promisify(execFile);

function getFfmpegPath(): string {
  return (ffmpeg as any).ffmpegPath?.() ?? "ffmpeg";
}

function escapeFilterPath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/:/g, "\\:");
}

function buildFontEnv(): NodeJS.ProcessEnv {
  const fontsConfNative = path.resolve(process.cwd(), "fonts.conf");
  const fontsConfFwd = fontsConfNative.replace(/\\/g, "/");
  const cacheDir = path.join(os.homedir(), ".cache", "fontconfig");
  if (fs.existsSync(fontsConfNative)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  return {
    ...process.env,
    FONTCONFIG_FILE: fs.existsSync(fontsConfNative) ? fontsConfFwd : undefined,
  };
}

export function buildSafeFramingFilter(
  subtitlePath: string,
  width: number,
  height: number,
  logoPath?: string | null,
  focusX: number = CENTER_FOCUS,
): string {
  const assPath = escapeFilterPath(subtitlePath);
  // Horizontal crop offset biased toward the speaker (focusX in [0,1]); clamped
  // so the crop window never leaves the frame. focusX=0.5 yields a centered crop.
  const fx = Math.max(0, Math.min(1, focusX)).toFixed(4);
  const cropX = `'clip((in_w*${fx})-(${width}/2)\\,0\\,in_w-${width})'`;
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
  const focusX = await detectSpeakerFocusX(inputPath, clip);
  const filter = buildSafeFramingFilter(
    subtitlePath,
    config.verticalWidth,
    config.verticalHeight,
    logoPath,
    focusX,
  );
  const isNvenc = config.videoEncoder.includes("nvenc");
  const qualityArgs = isNvenc ? ["-cq", "18"] : ["-crf", "18"];
  const args = [
    "-ss", String(clip.startTime),
    "-i", inputPath,
    ...(logoPath ? ["-i", logoPath] : []),
    "-y",
    "-filter_complex", filter,
    "-map", "[v]",
    "-map", "0:a?",
    "-af", buildSpeechAudioFilter(clip.duration),
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
  const ffmpegBin = getFfmpegPath();
  logger.debug({ command: [ffmpegBin, ...args].join(" ") }, "FFmpeg started");
  try {
    const { stderr } = await execFileAsync(ffmpegBin, args, {
      env: buildFontEnv(),
      maxBuffer: 100 * 1024 * 1024,
    });
    if (stderr) logger.debug({ stderr }, "FFmpeg stderr (informational)");
    verifyOutput(outputPath);
  } catch (err: any) {
    logger.error(
      { err, stderr: err.stderr, stdout: err.stdout, command: [ffmpegBin, ...args].join(" ") },
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
