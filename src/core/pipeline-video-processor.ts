import type { PipelineConfig, PipelineProgress, PipelineResult, VideoInfo, GeneratedShort, ShortClip, DownloadedVideo } from "../types.js";
import { downloadAudioOnly, downloadVideoSection, cleanupVideo } from "./youtube.js";
import { transcribeVideo } from "./transcriber.js";
import { analyzeTranscript } from "./analyzer.js";
import { processClip, getFileStartTime } from "./video-processor.js";
import { sendSummary } from "./telegram.js";
import { logger } from "./logger.js";
import { deliverShort } from "./pipeline-delivery.js";
import { publicationStore, reserveForClip, saveTranscriptCache } from "./publication/clip-publication-flow.js";
import { PublicationRepository } from "./publication/publication-repository.js";
import pLimit from "p-limit";
export type ProgressCallback = (progress: PipelineProgress) => void;

/** Cuts one clip; `clip` holds ABSOLUTE times, the rendered clip is relative to the downloaded section. */
export async function renderClip(video: VideoInfo, clip: ShortClip, audio: DownloadedVideo, config: PipelineConfig): Promise<GeneratedShort> {
  const sectionPath = await downloadVideoSection(video, clip.startTime, clip.endTime, config);
  const sectionStartTime = await getFileStartTime(sectionPath);
  const expectedSectionStart = Math.max(0, clip.startTime - 2);
  const timestampsPreserved = Math.abs(sectionStartTime - expectedSectionStart) <= 10;
  const seekOffset = timestampsPreserved ? clip.startTime : Math.max(0, clip.startTime - expectedSectionStart);
  const sectionClip = { ...clip, startTime: seekOffset, endTime: seekOffset + clip.duration };
  logger.debug({ clipId: clip.id, sectionStartTime, expectedSectionStart, timestampsPreserved, seekOffset }, "Section seek offset");
  const short = await processClip({ ...audio, filePath: sectionPath }, sectionClip, config);
  return { ...short, source: { videoId: video.id, startTime: clip.startTime, endTime: clip.endTime } };
}

export async function processVideo(
  video: VideoInfo,
  config: PipelineConfig,
  onProgress?: ProgressCallback,
  maxShorts?: number,
): Promise<PipelineResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  const shorts: GeneratedShort[] = [];
  const emitProgress = (stage: PipelineProgress["stage"], message: string, progress = 0, currentShort?: number, totalShorts?: number) => {
    onProgress?.({ stage, videoId: video.id, videoTitle: video.title, currentShort, totalShorts, message, progress });
  };
  const db = publicationStore();
  try {
    emitProgress("downloading", `Baixando áudio: ${video.title}`, 0);
    const downloadedAudio = await downloadAudioOnly(video, config);
    let lastProgress = 20;
    emitProgress("transcribing", "Transcrevendo com Whisper...", lastProgress);
    const transcript = await transcribeVideo(downloadedAudio, {
      ...config,
      onProgress: (percent: number) => {
        const mapped = 20 + (percent / 100) * 20;
        if (mapped - lastProgress >= 1 || percent === 100) {
          lastProgress = mapped;
          emitProgress("transcribing", `Transcrevendo com Whisper... (${percent.toFixed(1)}%)`, mapped);
        }
      },
    });
    if (db) saveTranscriptCache(config, transcript);
    emitProgress("analyzing", "Analisando momentos virais...", 40);
    let clips = await analyzeTranscript(transcript, video.title, video.channelName, config);
    if (maxShorts !== undefined && maxShorts > 0 && clips.length > maxShorts) {
      clips = clips.slice(0, maxShorts);
    }
    if (clips.length === 0) {
      logger.warn({ videoId: video.id, videoTitle: video.title }, "Transcrição analisada, mas a IA considerou que não há trechos interessantes ou relevantes. Pulando vídeo.");
      if (!config.keepTempFiles) cleanupVideo(video.id, config);
      return { videoId: video.id, videoTitle: video.title, channelName: video.channelName, shorts: [], errors: [], processingTimeMs: Date.now() - startTime };
    }
    const totalClips = clips.length;
    emitProgress("cutting", `Gerando ${totalClips} shorts...`, 50, 0, totalClips);
    const limit = pLimit(2);
    await Promise.all(
      clips.map((clip, index) =>
        limit(async () => {
          const publicationId = db ? await reserveForClip(db, video, clip, config) : undefined;
          if (publicationId === null) return;
          try {
            emitProgress("cutting", `Processando corte ${index + 1}/${totalClips}`, 50 + ((index + 1) / totalClips) * 30, index + 1, totalClips);
            const short = await renderClip(video, clip, downloadedAudio, config);
            shorts.push({ ...short, publicationId });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (db && publicationId) await new PublicationRepository(db).transition(publicationId, ["reserved"], "failed", { error: message });
            errors.push(`Erro no corte ${clip.id}: ${message}`);
          }
        }),
      ),
    );
    emitProgress("uploading", "Enviando resultados...", 85);
    for (const short of shorts) {
      try {
        await deliverShort(short, video, config);
      } catch (err) {
        errors.push(`Erro no envio de ${short.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    await sendSummary(video.title, video.channelName, shorts.length, errors, config);
    if (!config.keepTempFiles) cleanupVideo(video.id, config);
    emitProgress("done", "Concluído", 100);
  } catch (err) {
    logger.error({ videoId: video.id, error: err }, "Fatal video error");
    errors.push(String(err));
    if (!config.keepTempFiles) cleanupVideo(video.id, config);
    await sendSummary(video.title, video.channelName, shorts.length, errors, config);
  }
  return { videoId: video.id, videoTitle: video.title, channelName: video.channelName, shorts, errors, processingTimeMs: Date.now() - startTime };
}
