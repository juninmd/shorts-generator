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
 * Use AI (Vision) to detect the horizontal center of the person's face.
 * Extracts a frame from the middle of the clip.
 */
async function detectFaceCenter(inputPath: string, clip: ShortClip, config: PipelineConfig): Promise<number> {
  if (config.aiProvider !== "openrouter") return 0.5; // Fallback for local models without vision

  const framePath = path.join(config.tempDir, `frame_${clip.id}.jpg`);
  const frameTime = clip.startTime + (clip.duration / 2);

  try {
    // Extract a single frame from the middle of the clip
    const ffmpegBin = (ffmpeg as any).ffmpegPath?.() ?? "ffmpeg";
    await execFileAsync(ffmpegBin, [
      "-ss", String(frameTime),
      "-i", inputPath,
      "-frames:v", "1",
      "-q:v", "2",
      "-y",
      framePath
    ]);

    if (!fs.existsSync(framePath)) return 0.5;

    const frameBase64 = fs.readFileSync(framePath).toString("base64");
    
    // Use Gemini (via OpenRouter) to find the face
    const { text } = await generateText({
      model: createModel(config),
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Identify the horizontal center (X coordinate) of the main person's face in this image. Respond ONLY with a decimal number between 0 (left edge) and 1 (right edge). Example: 0.5" },
            { type: "image", image: frameBase64, mimeType: "image/jpeg" }
          ]
        }
      ],
      temperature: 0,
      maxOutputTokens: 10,
    });

    if (!config.keepTempFiles) fs.unlinkSync(framePath);

    const faceX = parseFloat(text.trim());
    return isNaN(faceX) ? 0.5 : Math.max(0, Math.min(1, faceX));
  } catch (err) {
    logger.warn({ clipId: clip.id, err }, "AI Face tracking failed, falling back to center");
    if (fs.existsSync(framePath)) fs.unlinkSync(framePath);
    return 0.5;
  }
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
