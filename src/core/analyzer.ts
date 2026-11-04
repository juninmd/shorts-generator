import type { PipelineConfig, ShortClip, Transcript } from "../types.js";
import {
  analyzeInChunks,
  CHUNK_THRESHOLD_CHARS,
  deduplicateClips,
  formatTranscriptForLLM,
} from "./analyzer-chunks.js";
import { analyzeSinglePass } from "./analyzer-generation.js";
import { selectClips } from "./analyzer-select.js";
import { discoverTextualCandidates } from "./candidate-discovery.js";
import { buildEnergyHint, type AudioSignals } from "./audio-signals.js";
import { buildReplayHint } from "./replay-heatmap.js";
import { getMaxCuts, getMinCuts } from "./config.js";
import { logger } from "./logger.js";

export { analyzeSinglePass } from "./analyzer-generation.js";

export async function analyzeTranscript(
  transcript: Transcript,
  videoTitle: string,
  channelName: string,
  baseConfig: PipelineConfig,
  signals?: AudioSignals | null,
): Promise<ShortClip[]> {
  const hints = signals ? buildEnergyHint(signals) + buildReplayHint(signals.heatmap) : "";
  const config = hints ? { ...baseConfig, analysisHints: hints } : baseConfig;
  const minCuts = config.maxClipsOverride ?? (process.env.CLIP_QUOTA === "strict" ? getMinCuts(transcript.duration) : 0);
  const maxCuts = config.maxClipsOverride ?? getMaxCuts(transcript.duration);
  const candidateMax = Math.min(12, maxCuts * 2);
  const formatted = formatTranscriptForLLM(transcript.segments);
  const startedAt = Date.now();
  logger.info(
    { videoId: transcript.videoId, minCuts, maxCuts, candidateMax },
    "Starting professional clip selection",
  );

  const rawClips = formatted.length > CHUNK_THRESHOLD_CHARS
    ? await analyzeInChunks(
      transcript,
      videoTitle,
      channelName,
      config,
      minCuts,
      candidateMax,
      analyzeSinglePass,
    )
    : await analyzeSinglePass(
      formatted,
      videoTitle,
      channelName,
      config,
      minCuts,
      candidateMax,
    );

  const discovered = discoverTextualCandidates(
    transcript,
    config.minShortDuration,
    config.maxShortDuration,
    candidateMax,
  );
  const candidates = [
    ...deduplicateClips(rawClips).slice(0, candidateMax),
    ...deduplicateClips(discovered).slice(0, candidateMax),
  ];
  const { clips: result, trail } = await selectClips(
    candidates, transcript, config, maxCuts, candidateMax, signals,
  );
  config.audit?.checkpoint("selection", { ...trail, rawCandidates: rawClips.length, discovered: discovered.length });
  logger.info(
    {
      videoId: transcript.videoId,
      rawCandidates: rawClips.length,
      discoveredCandidates: discovered.length,
      uniqueCandidates: candidates.length,
      approved: result.length,
      elapsedSec: ((Date.now() - startedAt) / 1000).toFixed(1),
    },
    "Professional clip selection completed",
  );
  return result;
}
