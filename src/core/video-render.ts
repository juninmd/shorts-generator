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

  // Get actual video dimensions to compute crop box as integers (avoids FFmpeg expression bugs)
  const { width: inputW, height: inputH } = await getInputDimensions(inputPath);
  const targetAspect = w / h;

  let cropW: number, cropH: number;
  if (inputW / inputH >= targetAspect) {
    // Landscape source: crop width, keep full height
    cropH = inputH;
    cropW = Math.floor(inputH * targetAspect);
  } else {
    // Portrait/square source: crop height, keep full width
    cropW = inputW;
    cropH = Math.floor(inputW / targetAspect);
  }

  // Center crop on detected face, clamped to valid range
  const startX = Math.max(0, Math.min(inputW - cropW, Math.round(inputW * faceX - cropW / 2)));
  const startY = Math.max(0, Math.floor((inputH - cropH) / 2));

  logger.debug({ inputW, inputH, cropW, cropH, startX, startY, faceX }, "Crop parameters");

  // Video filter: Smart Crop → Lanczos Scale → Denoise → Sharpen → 60FPS → Color Fix → Progress Bar → Subtitles
  const filters = [
    `crop=${cropW}:${cropH}:${startX}:${startY}`,
    `scale=${w}:${h}:flags=lanczos`,
    `hqdn3d=1.5:1.5:6:6`, // High-quality denoise for cleaner image
    `unsharp=5:5:0.8:5:5:0.0`, // Sharper edges
    `fps=60`, // Fluid motion
    `eq=contrast=1.12:brightness=0.03:saturation=1.25`, // Vibrant cinematic colors
    `drawbox=y=ih-15:color=yellow@0.8:width=iw*t/${clip.duration}:height=8:t=fill`, // Progress bar
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
  // CRF 16 for near-lossless quality. Higher bitrate for 60fps.
  const qualityArgs = isNvenc 
    ? ["-cq", "16", "-b:v", "8M", "-maxrate:v", "12M", "-bufsize:v", "16M"] 
    : ["-crf", "16", "-preset", "slow"];

  const args = [
    "-ss", String(clip.startTime),
    "-i", inputPath,
    "-y",
    "-vf", filters.join(","),
    // Audio: Compression (dynamics), Warm EQ (bass/treble), and Pro Loudness Normalization
    "-af", "acompressor=threshold=-18dB:ratio=3:attack=5:release=50,bass=g=4:f=100,treble=g=2:f=4500,loudnorm=I=-14:TP=-1.0:LRA=11",
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

/**
 * Get video dimensions (width, height) via ffprobe.
 */
function getInputDimensions(filePath: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return resolve({ width: 1920, height: 1080 });
      const stream = metadata.streams.find((s) => s.codec_type === "video");
      resolve({ width: stream?.width ?? 1920, height: stream?.height ?? 1080 });
    });
  });
}
