import type { PipelineConfig, ShortClip, Transcript } from "../types.js";
import {
  analyzeInChunks,
  CHUNK_THRESHOLD_CHARS,
  deduplicateClips,
  formatTranscriptForLLM,
} from "./analyzer-chunks.js";
import { analyzeSinglePass } from "./analyzer-generation.js";
import { reviewClipCandidates } from "./clip-quality.js";
import { processClips } from "./clip-processing.js";
import { repairClipCandidates } from "./clip-repair.js";
import { discoverTextualCandidates } from "./candidate-discovery.js";
import { getMaxCuts, getMinCuts } from "./config.js";
import { logger } from "./logger.js";

export { analyzeSinglePass } from "./analyzer-generation.js";

export async function analyzeTranscript(
  transcript: Transcript,
  videoTitle: string,
  channelName: string,
  config: PipelineConfig,
): Promise<ShortClip[]> {
  const minCuts = config.maxClipsOverride ?? getMinCuts(transcript.duration);
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
  const modelCandidates = deduplicateClips(rawClips).slice(0, candidateMax);
  const textualCandidates = deduplicateClips(discovered).slice(0, candidateMax);
  const candidates = [...modelCandidates, ...textualCandidates];
  const reviewed = deduplicateClips(
    await reviewClipCandidates(candidates, transcript, config),
  );
  let result = processClips(reviewed, transcript, config, maxCuts);
  if (result.length === 0 && candidates.length > 0) {
    const repaired = deduplicateClips(
      await repairClipCandidates(candidates, transcript, config, candidateMax),
    );
    const reviewedRepairs = await reviewClipCandidates(repaired, transcript, config);
    result = processClips(reviewedRepairs, transcript, config, maxCuts);
    logger.info(
      { repairedCandidates: repaired.length, approvedRepairs: result.length },
      "Clip repair pass completed",
    );
  }
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
