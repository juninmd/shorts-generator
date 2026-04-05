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
  // fluent-ffmpeg exposes this on the constructor
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (ffmpeg as any).ffmpegPath?.() ?? "ffmpeg";
}

/**
 * Render the short video using FFmpeg with vertical crop and burnt subtitles.
 * Uses execFile directly (not fluent-ffmpeg) to avoid Windows spawn issues.
 */
export async function renderShort(
  inputPath: string,
  outputPath: string,
  subtitlePath: string,
  clip: ShortClip,
  config: PipelineConfig,
): Promise<void> {
  const { verticalWidth: w, verticalHeight: h } = config;

  // Escape subtitle path for FFmpeg filter (handle backslashes and colons on Windows)
  const escapedSubPath = subtitlePath
    .replace(/\\/g, "/")
    .replace(/:/g, "\\:");

  // Video filter: crop to 9:16 center, scale to target resolution, burn subtitles
  // Watermark is embedded in the ASS file to avoid drawtext filter dependency
  const filters = [
    `crop=min(iw\\,ih*${w}/${h}):min(ih\\,iw*${h}/${w})`,
    `scale=${w}:${h}`,
    `ass='${escapedSubPath}'`,
  ];

  // Build env — use forward-slash FONTCONFIG_FILE to prevent libass crash on Windows
  const fontsConfNative = path.resolve(process.cwd(), "fonts.conf");
  const fontsConfFwd = fontsConfNative.replace(/\\/g, "/");
  const cacheDir = path.join(os.homedir(), ".cache", "fontconfig");
  if (fs.existsSync(fontsConfNative)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  const spawnEnv: NodeJS.ProcessEnv = {
    ...process.env,
    FONTCONFIG_FILE: fs.existsSync(fontsConfNative) ? fontsConfFwd : undefined,
  };

  const isNvenc = config.videoEncoder.includes("nvenc");
  const qualityArgs = isNvenc ? ["-cq", "20"] : ["-crf", "20"];

  const args = [
    "-ss", String(clip.startTime),
    "-i", inputPath,
    "-y",
    "-vf", filters.join(","),
    "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
    "-t", String(clip.duration),
    "-c:v", config.videoEncoder,
    "-preset", isNvenc ? "p4" : "fast",
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
  logger.debug({ command: [ffmpegBin, ...args].join(" ") }, "FFmpeg started");

  try {
    const { stderr } = await execFileAsync(ffmpegBin, args, {
      env: spawnEnv,
      maxBuffer: 100 * 1024 * 1024,
    });

    if (stderr) logger.debug({ stderr }, "FFmpeg stderr (informational)");

    // Final integrity check: ensure the file exists and has a reasonable size (> 100KB)
    if (!fs.existsSync(outputPath)) {
      throw new Error(`FFmpeg finished but output file is missing: ${outputPath}`);
    }
    const stats = fs.statSync(outputPath);
    if (stats.size < 100 * 1024) {
      throw new Error(`FFmpeg output is too small (${(stats.size / 1024).toFixed(1)}KB). Video is likely corrupted.`);
    }

    logger.debug({ outputPath, size: stats.size }, "Video integrity verified");
  } catch (err: any) {
    logger.error(
      {
        err,
        stderr: err.stderr,
        stdout: err.stdout,
        command: [ffmpegBin, ...args].join(" "),
      },
      "FFmpeg CRASHED! O vídeo gerado provavelmente está corrompido ou vazio.",
    );
    throw new Error(`FFmpeg failed to render short: ${err.message}`);
  }
}
