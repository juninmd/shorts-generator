/* v8 ignore start */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ffmpeg from "fluent-ffmpeg";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  ShortClip,
  PipelineConfig,
} from "../types.js";
import { logger } from "./logger.js";

const execFileAsync = promisify(execFile);

/**
 * Resolve the FFmpeg binary path via fluent-ffmpeg's configured path.
 */
function getFfmpegPath(): string {
  return (ffmpeg as any).ffmpegPath?.() ?? "ffmpeg";
}

/**
 * Render the short video using FFmpeg with vertical crop and burnt subtitles.
 * Optimized for quality and audio clarity.
 * 
 * @param faceX Normalized horizontal center (0 to 1) for smart cropping.
 */
export async function renderShort(
  inputPath: string,
  outputPath: string,
  subtitlePath: string,
  clip: ShortClip,
  config: PipelineConfig,
  faceX: number = 0.5
): Promise<void> {
  const { verticalWidth: w, verticalHeight: h } = config;

  // Escape subtitle path for FFmpeg filter
  const escapedSubPath = subtitlePath
    .replace(/\\/g, "/")
    .replace(/:/g, "\\:");

  // Smart Crop Logic:
  // Center the 9:16 crop around faceX (normalized 0-1 coordinate)
  // We need to ensure the crop box doesn't go out of bounds [0, iw]
  const cropW = `min(iw\\,ih*${w}/${h})`;
  const cropH = `min(ih\\,iw*${h}/${w})`;
  const centerX = `iw*${faceX}`;
  const startX = `max(0\\,min(iw-${cropW}\\,${centerX}-${cropW}/2))`;

  // Video filter: Smart Crop → Lanczos Scale → Sharpen → Color Fix → Subtitles
  const filters = [
    `crop=${cropW}:${cropH}:${startX}:0`,
    `scale=${w}:${h}:flags=lanczos`,
    `unsharp=3:3:1.5:3:3:0.5`,
    `eq=contrast=1.03:brightness=0.01:saturation=1.05`,
    `ass='${escapedSubPath}'`,
  ];

  // Build env for libass/fontconfig
  const fontsConfNative = path.resolve(process.cwd(), "fonts.conf");
  const fontsConfFwd = fontsConfNative.replace(/\\/g, "/");
  const spawnEnv: NodeJS.ProcessEnv = {
    ...process.env,
    FONTCONFIG_FILE: fs.existsSync(fontsConfNative) ? fontsConfFwd : undefined,
  };

  const isNvenc = config.videoEncoder.includes("nvenc");
  // Lower CRF (18) for higher quality
  const qualityArgs = isNvenc ? ["-cq", "18"] : ["-crf", "18"];

  const args = [
    "-ss", String(clip.startTime),
    "-i", inputPath,
    "-y",
    "-vf", filters.join(","),
    // Audio: Compression (dynamics), Warm EQ (bass/treble), and Pro Loudness Normalization
    "-af", "acompressor=threshold=-20dB:ratio=4:attack=5:release=50,bass=g=3:f=100,treble=g=2:f=4000,loudnorm=I=-16:TP=-1.5:LRA=11",
    "-t", String(clip.duration),
    "-c:v", config.videoEncoder,
    "-preset", isNvenc ? "p4" : "slow", 
    ...qualityArgs,
    "-c:a", "aac",
    "-b:a", "192k",
    "-ar", "44100",
    "-movflags", "+faststart",
    "-pix_fmt", "yuv420p",
    "-r", "30",
    outputPath,
  ];

  const ffmpegBin = getFfmpegPath();
  logger.debug({ command: [ffmpegBin, ...args].join(" ") }, "FFmpeg started rendering");

  try {
    const { stderr } = await execFileAsync(ffmpegBin, args, {
      env: spawnEnv,
      maxBuffer: 100 * 1024 * 1024,
    });

    if (stderr) logger.debug({ stderr }, "FFmpeg stderr log");

    if (!fs.existsSync(outputPath)) {
      throw new Error(`FFmpeg output missing: ${outputPath}`);
    }
    const stats = fs.statSync(outputPath);
    if (stats.size < 100 * 1024) {
      throw new Error("FFmpeg output too small - likely corrupt");
    }

    logger.debug({ outputPath, size: stats.size }, "Video integrity verified");
  } catch (err: any) {
    logger.error({ err, command: [ffmpegBin, ...args].join(" ") }, "FFmpeg CRASHED!");
    throw new Error(`FFmpeg failed: ${err.message}`);
  }
}
