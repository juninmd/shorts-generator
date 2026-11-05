import path from "node:path";
import type { HeatSegment, PipelineConfig, ShortClip, Transcript, VideoInfo } from "../types.js";
import { analyzeTranscript } from "./analyzer.js";
import { computeAudioSignals, type AudioSignals } from "./audio-signals.js";
import { cacheEnabled, hashKey, readCache, writeCache } from "./disk-cache.js";
import { withUsage } from "./llm-usage.js";
import { createVideoAudit } from "./run-audit.js";
import { buildSourceBrief } from "./source-brief.js";

const CACHE_VERSION = 1;

/** Loudness and the audience replay curve travel together; either one alone still ranks clips. */
export function withHeatmap(signals: AudioSignals | null, heatmap?: HeatSegment[]): AudioSignals | null {
  if (!heatmap) return signals;
  return { rmsPerSecond: signals?.rmsPerSecond ?? [], heatmap };
}

/** Transcript cache: a re-run of the same video never pays for Whisper twice. */
export async function withTranscriptCache(
  videoId: string,
  config: PipelineConfig,
  transcribe: () => Promise<Transcript>,
): Promise<Transcript> {
  const dir = path.join(config.outputDir ?? "", "cache", "transcripts");
  const name = hashKey({ CACHE_VERSION, videoId });
  const cached = cacheEnabled() ? readCache<Transcript>(dir, name, 30) : null;
  if (cached) return cached;
  const transcript = await transcribe();
  writeCache(dir, name, transcript);
  return transcript;
}

/**
 * Picks the clips for one video, audited stage by stage. Non-empty plans are cached by
 * transcript + settings, so a re-run is free and returns the same clips.
 */
export async function analyzeVideo(
  video: VideoInfo,
  transcript: Transcript,
  audioPath: string,
  config: PipelineConfig,
  maxShorts?: number,
): Promise<ShortClip[]> {
  const audit = createVideoAudit(config.outputDir, video);
  audit.checkpoint("transcript", { language: transcript.language, duration: transcript.duration, segments: transcript.segments });
  const dir = path.join(config.outputDir ?? "", "cache", "plans");
  const name = hashKey({
    CACHE_VERSION, id: video.id, text: hashKey(transcript.fullText), model: config.aiModel,
    min: config.minShortDuration, max: config.maxShortDuration, score: config.minViralScore,
    genre: config.videoGenre, heat: video.heatmap ? hashKey(video.heatmap) : undefined, prompt: config.clipPrompt, cap: config.maxClipsOverride,
  });
  let clips = cacheEnabled() ? readCache<ShortClip[]>(dir, name) : null;
  if (clips) {
    audit.checkpoint("analysis", { cached: true, clips: clips.length });
  } else {
    const { result, usage } = await withUsage(async () => analyzeTranscript(
      transcript, video.title, video.channelName,
      { ...config, sourceBrief: buildSourceBrief(video), audit },
      withHeatmap(await computeAudioSignals(audioPath), video.heatmap),
    ));
    clips = result;
    if (clips.length > 0) writeCache(dir, name, clips);
    audit.checkpoint("usage", usage);
  }
  return maxShorts !== undefined && maxShorts > 0 && clips.length > maxShorts ? clips.slice(0, maxShorts) : clips;
}
