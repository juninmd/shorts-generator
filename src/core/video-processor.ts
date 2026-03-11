import ffmpeg from "fluent-ffmpeg";
import fs from "node:fs";
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

/**
 * Render the short video using FFmpeg with vertical crop and burnt subtitles.
 */
function renderShort(
  inputPath: string,
  outputPath: string,
  subtitlePath: string,
  clip: ShortClip,
  config: PipelineConfig,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const { verticalWidth: w, verticalHeight: h } = config;

    // Escape subtitle path for FFmpeg filter (handle backslashes and colons on Windows)
    const escapedSubPath = subtitlePath
      .replace(/\\/g, "/")
      .replace(/:/g, "\\:");

    // Escape watermark text
    const watermarkText = (config.watermarkText || "").replace(/[\\':,=\[\];%]/g, (c) => `\\${c}`);

    // Video filter: crop to 9:16 center, scale to target resolution, burn subtitles, draw watermark
    const filters = [
      // Crop to 9:16 aspect ratio from center of frame
      `crop=min(iw\\,ih*${w}/${h}):min(ih\\,iw*${h}/${w})`,
      // Scale to target resolution
      `scale=${w}:${h}`,
      // Burn ASS subtitles
      `ass='${escapedSubPath}'`,
    ];

    if (watermarkText) {
      // Bottom right corner, well small
      filters.push(`drawtext=text='${watermarkText}':x=w-tw-5:y=h-th-5:fontsize=12:fontcolor=white@0.5:shadowcolor=black@0.5:shadowx=1:shadowy=1`);
    }

    const videoFilter = filters.join(",");

    ffmpeg(inputPath)
      .setStartTime(clip.startTime)
      .setDuration(clip.duration)
      .videoFilters(videoFilter)
      .outputOptions([
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "23",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-ar",
        "44100",
        "-movflags",
        "+faststart",
        "-pix_fmt",
        "yuv420p",
        "-r",
        "30",
      ])
      .output(outputPath)
      .on("start", (cmd) => {
        logger.debug({ command: cmd }, "FFmpeg started");
      })
      .on("progress", (progress) => {
        if (progress.percent) {
          logger.debug(
            { percent: progress.percent.toFixed(1) },
            "FFmpeg progress",
          );
        }
      })
      .on("error", (err) => {
        logger.error({ error: err.message }, "FFmpeg error");
        reject(err);
      })
      .on("end", () => {
        resolve();
      })
      .run();
  });
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
