/* v8 ignore start */
import {
  downloadAudioOnly,
  downloadVideoSection,
  cleanupVideo,
} from "./youtube.js";
import { isDailyLimitReached, incrementDailyUploadCount } from "./state.js";
import { transcribeVideo } from "./transcriber.js";
import { analyzeTranscript } from "./analyzer.js";
import { processClip, getFileStartTime } from "./video-processor.js";
import { sendToTelegram, sendSummary } from "./telegram.js";
import { generateYoutubeMetadata, uploadToYouTube } from "./youtube.service.js";
import { logger } from "./logger.js";
import type {
  PipelineConfig,
  PipelineResult,
  VideoInfo,
  GeneratedShort,
  PipelineProgress,
} from "../types.js";
import pLimit from "p-limit";

export type ProgressCallback = (progress: PipelineProgress) => void;

/**
 * Process a single video through the full pipeline.
 */
export async function processVideo(
  video: VideoInfo,
  config: PipelineConfig,
  onProgress?: ProgressCallback,
  maxShorts?: number,
): Promise<PipelineResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  const shorts: GeneratedShort[] = [];

  const emitProgress = (stage: PipelineProgress["stage"], message: string, progress: number = 0, currentShort?: number, totalShorts?: number) => {
    onProgress?.({ stage, videoId: video.id, videoTitle: video.title, currentShort, totalShorts, message, progress });
  };

  try {
    emitProgress("downloading", `Baixando áudio: ${video.title}`, 0);
    const downloadedAudio = await downloadAudioOnly(video, config);

    emitProgress("transcribing", "Transcrevendo com Whisper...", 20);
    const transcript = await transcribeVideo(downloadedAudio, {
      ...config,
      onProgress: (percent: number) => emitProgress("transcribing", `Whisper (${percent.toFixed(0)}%)`, 20 + (percent / 100) * 20),
    });

    emitProgress("analyzing", "Analisando momentos virais...", 40);
    let clips = await analyzeTranscript(transcript, video.title, video.channelName, config);
    if (maxShorts && clips.length > maxShorts) clips = clips.slice(0, maxShorts);

    if (clips.length === 0) {
      if (!config.keepTempFiles) cleanupVideo(video.id, config);
      return { videoId: video.id, videoTitle: video.title, channelName: video.channelName, shorts: [], errors: [], processingTimeMs: Date.now() - startTime };
    }

    const totalClips = clips.length;
    const limit = pLimit(2);
    await Promise.all(clips.map((clip, index) => limit(async () => {
      try {
        emitProgress("cutting", `Processando ${index + 1}/${totalClips}`, 50 + ((index + 1) / totalClips) * 30, index + 1, totalClips);
        const sectionPath = await downloadVideoSection(video, clip.startTime, clip.endTime, config);
        const downloadedSection = { ...downloadedAudio, filePath: sectionPath };

        const sectionStartTime = await getFileStartTime(sectionPath);
        const expectedStart = Math.max(0, clip.startTime - 2);
        const seekOffset = Math.abs(sectionStartTime - expectedStart) <= 10 ? clip.startTime : Math.max(0, clip.startTime - expectedStart);
        
        const short = await processClip(downloadedSection, { ...clip, startTime: seekOffset, endTime: seekOffset + clip.duration }, config);
        shorts.push(short);
      } catch (err: any) {
        errors.push(`Corte ${clip.id}: ${err.message}`);
      }
    })));

    emitProgress("uploading", "Enviando resultados...", 85);
    const youtubeEnabled = process.env.ENABLE_YOUTUBE === "true";

    for (const short of shorts) {
      try {
        const youtubeMeta = await generateYoutubeMetadata(short, config);
        let youtubeUrl: string | undefined;
        if (youtubeEnabled && !(await isDailyLimitReached(config.dailyUploadLimit))) {
          youtubeUrl = await uploadToYouTube(short.outputPath, youtubeMeta.title, youtubeMeta.description, config) || undefined;
          await incrementDailyUploadCount();
        }
        const msgId = await sendToTelegram(short, config, youtubeUrl);
        if (msgId) short.telegramMessageId = msgId;
      } catch (err: any) {
        errors.push(`Upload ${short.id}: ${err.message}`);
      }
    }

    await sendSummary(video.title, video.channelName, shorts.length, errors, config);
    if (!config.keepTempFiles) cleanupVideo(video.id, config);
    emitProgress("done", "Concluído", 100);
  } catch (err: any) {
    logger.error({ videoId: video.id, error: err }, "Fatal video error");
    errors.push(err.message);
    if (!config.keepTempFiles) cleanupVideo(video.id, config);
  }

  return { videoId: video.id, videoTitle: video.title, channelName: video.channelName, shorts, errors, processingTimeMs: Date.now() - startTime };
}
