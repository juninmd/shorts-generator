import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ffmpeg from "fluent-ffmpeg";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  ShortClip,
  DownloadedVideo,
  GeneratedShort,
  PipelineConfig,
} from "../types.js";
import { generateASSSubtitles } from "./subtitle.js";
import { logger } from "./logger.js";

/**
 * Process a single clip: cut, convert to vertical, apply subtitles.
 */
export async function processClip(
  video: DownloadedVideo,
  clip: ShortClip,
  config: PipelineConfig,
): Promise<GeneratedShort> {
  const outputDir = path.join(config.outputDir, video.id);
  fs.mkdirSync(outputDir, { recursive: true });

  const subtitlePath = path.join(outputDir, `${clip.id}.ass`);
  const outputPath = path.join(outputDir, `${clip.id}.mp4`);

  logger.info(
    {
      clipId: clip.id,
      videoId: video.id,
      start: clip.startTime,
      end: clip.endTime,
      duration: clip.duration,
    },
    "Processing clip",
  );

  // Generate ASS subtitles
  const assContent = generateASSSubtitles(
    clip,
    config.verticalWidth,
    config.verticalHeight,
  );
  fs.writeFileSync(subtitlePath, assContent, "utf-8");

  // Process video: cut → vertical crop → burn subtitles
  await renderShort(video.filePath, outputPath, subtitlePath, clip, config);

  const result: GeneratedShort = {
    id: clip.id,
    clip,
    outputPath,
    subtitlePath,
    originalVideoUrl: video.url,
    originalVideoTitle: video.title,
    channelName: video.channelName,
    status: "completed",
    createdAt: new Date().toISOString(),
  };

  logger.info({ clipId: clip.id, outputPath }, "Clip processed successfully");
  return result;
}

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
async function renderShort(
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

  // Escape watermark text
  const watermarkText = (config.watermarkText || "").replace(
    /[\\':,=\[\];%]/g,
    (c) => `\\${c}`,
  );

  // Video filter: crop to 9:16 center, scale to target resolution, burn subtitles
  const filters = [
    `crop=min(iw\\,ih*${w}/${h}):min(ih\\,iw*${h}/${w})`,
    `scale=${w}:${h}`,
    `ass='${escapedSubPath}'`,
  ];

  if (watermarkText) {
    // 1. Try local project font first (best for portability)
    // 2. Fallback to system fonts if local is missing
    const localFontPath = path.resolve(process.cwd(), "assets", "fonts", "font.ttf");
    let fontfile = localFontPath;

    if (!fs.existsSync(localFontPath)) {
      fontfile = os.platform() === "win32"
        ? "C:/Windows/Fonts/arial.ttf"
        : "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
    }

    // Escape for FFmpeg: handle Windows drive colons and backslashes
    const escapedFontfile = fontfile.replace(/\\/g, "/").replace(/:/g, "\\:");

    filters.push(
      `drawtext=fontfile='${escapedFontfile}':text='${watermarkText}':x=w-tw-20:y=h-th-20:fontsize=36:fontcolor=white@0.5:shadowcolor=black@0.5:shadowx=2:shadowy=2`,
    );
  }

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

  const { stderr } = await execFileAsync(ffmpegBin, args, {
    env: spawnEnv,
    maxBuffer: 100 * 1024 * 1024,
  });

  if (stderr) logger.debug({ stderr }, "FFmpeg stderr");
}

/**
 * Get the duration of a video file in seconds.
 */
export function getVideoDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata?.format?.duration ?? 0);
    });
  });
}
