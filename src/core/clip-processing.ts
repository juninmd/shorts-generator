import { nanoid } from "nanoid";
import type {
  PipelineConfig,
  ShortClip,
  Transcript,
  TranscriptSegment,
  TranscriptWord,
} from "../types.js";
import type { ClipItem } from "./analyzer-schema.js";
import { snapToSentenceBoundaries } from "./clip-boundary.js";
import { logger } from "./logger.js";

const SPEECH_TAIL_SECONDS = 0.6;

const normalizeTitle = (title: string): string =>
  title.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim();

function segmentsInRange(
  segments: TranscriptSegment[],
  start: number,
  end: number,
): TranscriptSegment[] {
  return segments
    .filter((segment) => segment.start >= start - 0.5 && segment.end <= end + 0.5)
    .map((segment) => ({
      start: Math.max(0, segment.start - start),
      end: segment.end - start,
      text: segment.text,
    }));
}

function wordsInRange(words: TranscriptWord[], start: number, end: number): TranscriptWord[] {
  return words
    .filter((word) => word.start >= start - 0.1 && word.end <= end + 0.1)
    .map((word) => ({
      word: word.word,
      start: Math.max(0, word.start - start),
      end: word.end - start,
    }));
}

export function processClips(
  clips: ClipItem[],
  transcript: Transcript,
  config: PipelineConfig,
  maxCuts: number,
): ShortClip[] {
  const valid = clips.filter((clip) => {
    const duration = clip.endTime - clip.startTime;
    return duration >= config.minShortDuration
      && duration <= config.maxShortDuration
      && clip.startTime >= 0
      && clip.endTime <= transcript.duration;
  });
  const minimumScore = config.minViralScore ?? 0;
  const seenTitles = new Set<string>();
  const selected = valid
    .filter((clip) => clip.viralScore >= minimumScore)
    .sort((a, b) => b.viralScore - a.viralScore)
    .filter((clip) => {
      const key = normalizeTitle(clip.title);
      if (seenTitles.has(key)) return false;
      seenTitles.add(key);
      return true;
    })
    .slice(0, maxCuts);

  logger.info(
    { total: clips.length, valid: valid.length, selected: selected.length },
    "Clip quality filters applied",
  );
  return selected.map((clip) => {
    const snapped = snapToSentenceBoundaries(clip, transcript.segments, config);
    const endTime = Math.min(
      transcript.duration,
      snapped.startTime + config.maxShortDuration,
      snapped.endTime + SPEECH_TAIL_SECONDS,
    );
    return {
      id: nanoid(10),
      videoId: transcript.videoId,
      title: clip.title,
      presenter: clip.presenter?.trim() || undefined,
      description: clip.description,
      startTime: snapped.startTime,
      endTime,
      duration: endTime - snapped.startTime,
      viralScore: clip.viralScore,
      reason: clip.reason,
      transcript: segmentsInRange(transcript.segments, snapped.startTime, endTime),
      words: wordsInRange(transcript.words, snapped.startTime, endTime),
      hashtags: clip.hashtags,
    };
  });
}
