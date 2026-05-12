import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import ffmpeg from "fluent-ffmpeg";
import type { PipelineConfig, ShortClip } from "../types.js";
import { logger } from "./logger.js";

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
): string {
  const assPath = escapeFilterPath(subtitlePath);
  return [
    `[0:v]scale=w='if(gt(iw/ih,${width}/${height}),-1,${width})':h='if(gt(iw/ih,${width}/${height}),${height},-1)':flags=lanczos,crop=${width}:${height},setsar=1,ass='${assPath}'[v]`
  ].join(";");
}

export async function renderShort(
  inputPath: string,
  outputPath: string,
  subtitlePath: string,
  clip: ShortClip,
  config: PipelineConfig,
): Promise<void> {
  const filter = buildSafeFramingFilter(
    subtitlePath,
    config.verticalWidth,
    config.verticalHeight,
  );
  const isNvenc = config.videoEncoder.includes("nvenc");
  const qualityArgs = isNvenc ? ["-cq", "18"] : ["-crf", "18"];
  const args = [
    "-ss", String(clip.startTime),
    "-i", inputPath,
    "-y",
    "-filter_complex", filter,
    "-map", "[v]",
    "-map", "0:a?",
    "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
    "-t", String(clip.duration),
    "-c:v", config.videoEncoder,
    "-preset", isNvenc ? "p7" : "slow",
    ...qualityArgs,
    "-c:a", "aac",
    "-b:a", "192k",
    "-ar", "44100",
    "-movflags", "+faststart",
    "-pix_fmt", "yuv420p",
    "-r", "30",
    outputPath,
  ];
  await runFfmpeg(args, outputPath);
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
