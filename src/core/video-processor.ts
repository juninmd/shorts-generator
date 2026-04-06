/* v8 ignore start */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ffmpeg from "fluent-ffmpeg";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateText } from "ai";
import { createModel } from "./ai-provider.js";
import type {
  ShortClip,
  DownloadedVideo,
  GeneratedShort,
  PipelineConfig,
} from "../types.js";
import { generateASSSubtitles } from "./subtitle.js";
import { logger } from "./logger.js";
import { renderShort } from "./video-render.js";

const execFileAsync = promisify(execFile);

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

  logger.info({ clipId: clip.id, videoId: video.id, title: clip.title }, "Processing clip with AI face tracking & high quality");

  // Step 1: Face Tracking (AI-powered centering)
  const faceX = await detectFaceCenter(video.filePath, clip, config);
  logger.info({ clipId: clip.id, faceX }, "AI Face Tracking result");

  // Step 2: Generate Subtitles
  const assContent = generateASSSubtitles(
    clip,
    config.verticalWidth,
    config.verticalHeight,
    config.watermarkText || undefined,
  );
  fs.writeFileSync(subtitlePath, assContent, "utf-8");

  // Step 3: Render Video (High Quality + Audio EQ + Smart Crop)
  await renderShort(video.filePath, outputPath, subtitlePath, clip, config, faceX);

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
 * Use local Python script (MediaPipe) to detect the horizontal center of the person's face.
 * Takes the average of 3 frames (start, middle, end) for better stability.
 */
async function detectFaceCenter(inputPath: string, clip: ShortClip, config: PipelineConfig): Promise<number> {
  const points = [0.2, 0.5, 0.8]; // Start, middle, end of the clip
  const centers: number[] = [];

  for (const p of points) {
    const framePath = path.join(config.tempDir, `frame_${clip.id}_${p}.jpg`);
    const frameTime = clip.startTime + (clip.duration * p);

    try {
      const ffmpegBin = (ffmpeg as any).ffmpegPath?.() ?? "ffmpeg";
      await execFileAsync(ffmpegBin, [
        "-ss", String(frameTime),
        "-i", inputPath,
        "-vf", "eq=contrast=1.3:brightness=0.1,scale=1280:720", // Boost visibility for AI
        "-frames:v", "1",
        "-q:v", "1", // High quality frame
        "-y",
        framePath
      ]);

      if (!fs.existsSync(framePath)) continue;

      // Use local python detection (FREE & FAST) from uv venv
      try {
        const pythonPath = path.join(process.cwd(), ".venv/Scripts/python.exe");
        const { stdout } = await execFileAsync(pythonPath, [
          path.join(process.cwd(), "scripts/detect_face.py"),
          framePath
        ]);
        const result = JSON.parse(stdout);
        if (typeof result.faceX === "number") {
          centers.push(result.faceX);
          logger.debug({ clipId: clip.id, frameTime, faceX: result.faceX, msg: result.message }, "Frame face detection success");
        } else {
          logger.debug({ clipId: clip.id, frameTime, error: result.error }, "Frame face detection found no face");
        }
      } catch (pythonErr) {
        logger.debug({ clipId: clip.id, pythonErr: (pythonErr as any).message }, "Local face detection command failed");
      }

      if (!config.keepTempFiles && fs.existsSync(framePath)) fs.unlinkSync(framePath);
    } catch (err) {
      logger.warn({ clipId: clip.id, frameTime, err }, "Frame extraction failed for face tracking");
    }
  }

  if (centers.length === 0) return 0.5;
  const avg = centers.reduce((a, b) => a + b, 0) / centers.length;
  return Math.max(0.15, Math.min(0.85, avg)); // Safety margin to avoid cutting edges
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

/**
 * Get the presentation start timestamp of a video file.
 */
export function getFileStartTime(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return resolve(0);
      const t = parseFloat(String(metadata?.format?.start_time ?? "0"));
      resolve(isNaN(t) ? 0 : t);
    });
  });
}
