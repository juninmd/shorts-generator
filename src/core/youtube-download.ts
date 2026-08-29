

import path from "node:path";
import fs from "node:fs";
import type { VideoInfo, DownloadedVideo, PipelineConfig } from "../types.js";
import { logger } from "./logger.js";
import { getYtDlpBaseArgs, withCookies, execYtDlp, diagnoseAudioDownloadFailure } from "./youtube-ytdlp.js";

/**
 * Download ONLY the audio of a video for transcription.
 * Very fast and lightweight.
 */
export async function downloadAudioOnly(
  video: VideoInfo,
  config: PipelineConfig,
): Promise<DownloadedVideo> {
  const videoDir = path.join(config.tempDir, video.id);
  fs.mkdirSync(videoDir, { recursive: true });

  const audioPath = path.join(videoDir, `${video.id}.wav`);

  logger.info({ videoId: video.id, title: video.title, outputPath: audioPath }, "Downloading audio only for transcription");

  return withCookies(config, async (tempCookiePath) => {
    const args = [
      ...getYtDlpBaseArgs(config, tempCookiePath),
      "-f", "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best",
      "--extract-audio",
      "--audio-format", "wav",
      "--postprocessor-args", "ffmpeg:-ar 16000 -ac 1",
      "--no-playlist",
      "--no-warnings",
      "-o", audioPath,
      "--",
      video.url
    ];

    try {
      const { stderr } = await execYtDlp(args, { timeout: 300_000 });

      // Check if file was actually created
      if (!fs.existsSync(audioPath)) {
        const tempFiles = fs.readdirSync(videoDir).filter(f => f.includes(video.id));

        const diagnostics = {
          videoId: video.id,
          expectedPath: audioPath,
          tempDirContents: tempFiles,
          stderrSample: stderr.slice(-500), // Last 500 chars
        };

        // Detect specific failure stage
        let stage = "unknown";
        if (stderr.includes("ERROR") && !stderr.includes("ffmpeg")) stage = "download_video_stream";
        else if (stderr.includes("ffmpeg") || stderr.includes("Post-processor")) stage = "ffmpeg_audio_extraction";
        else if (stderr.includes("WARNING")) stage = "with_warnings";

        logger.error({
          ...diagnostics,
          stage,
          message: `Audio file not created at ${audioPath}. Failed at: ${stage}`,
        }, "Audio download completed but file missing");

        throw new Error(
          `[AUDIO EXTRACTION FAILED] Stage: ${stage}\n` +
          `Expected: ${audioPath}\n` +
          `Stderr: ${stderr.split("\n").slice(-3).join("\n")}`
        );
      }

      const stats = fs.statSync(audioPath);
      if (stats.size < 1000) {
        logger.warn(
          { videoId: video.id, sizeBytes: stats.size },
          "Audio file suspiciously small (< 1KB) — may be corrupted"
        );
      }

      logger.info(
        { videoId: video.id, sizeKB: (stats.size / 1024).toFixed(0) },
        "✓ Audio downloaded and converted successfully"
      );

      return {
        ...video,
        filePath: "", // No video file yet
        audioPath,
        fileSize: stats.size,
      };
    } catch (err: any) {
      const errMsg = String(err?.stderr ?? err?.message ?? err);
      const stage = diagnoseAudioDownloadFailure(errMsg);

      logger.error({
        videoId: video.id,
        failureStage: stage,
        errorSample: errMsg.split("\n").slice(-5).join("\n"),
        url: video.url,
        outputPath: audioPath,
      }, `[${stage}] Audio download failed`);

      throw new Error(`[AUDIO DOWNLOAD FAILED - ${stage}]\n${errMsg.split("\n").slice(-3).join("\n")}`);
    }
  });
}


