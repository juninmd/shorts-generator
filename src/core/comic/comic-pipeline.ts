import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import type { ShortClip, TranscriptSegment } from "../../types.js";
import type { ComicBook, ComicChapter, ComicShortResult, NarratedChapter } from "./comic-types.js";
import { narrateChapters } from "./comic-tts.js";
import { renderChapterClip, concatChapterClips, burnSubtitles } from "./comic-video.js";
import { generateASSSubtitles } from "../subtitle.js";
import { finishDelivery } from "../short-delivery.js";
import { DELIVERY_SPECS } from "../delivery-spec.js";
import { logger } from "../logger.js";

export interface ComicPipelineConfig {
  outputDir: string;
  verticalWidth: number;
  verticalHeight: number;
  ttsVoice: string;
  watermarkText?: string;
  /** Background track; mixed under the narration with ducking when set. */
  musicPath?: string;
  /** Replaces the edge-tts narration (e.g. ElevenLabs with fallback, or silent). */
  narrate?: (chapters: ComicChapter[], workDir: string) => Promise<NarratedChapter[]>;
  /** Replaces the Ken Burns still clip (e.g. an animated stick-figure chapter). */
  renderChapter?: (chapter: NarratedChapter, clipPath: string) => Promise<void>;
  /** Replaces the karaoke ASS (e.g. when chapter clips already carry their own captions). */
  buildSubtitles?: (clip: ShortClip) => string;
}

/** Offsets each chapter's word timestamps onto the shared, concatenated timeline. */
function buildTimelineWords(chapters: NarratedChapter[]) {
  let offset = 0;
  const words: { word: string; start: number; end: number }[] = [];
  const segments: TranscriptSegment[] = [];
  for (const chapter of chapters) {
    segments.push({
      start: offset,
      end: offset + chapter.durationSec,
      text: chapter.narrationText,
    });
    for (const word of chapter.words) {
      words.push({ word: word.word, start: offset + word.start, end: offset + word.end });
    }
    offset += chapter.durationSec;
  }
  return { words, segments, totalDuration: offset };
}

/**
 * Narrates a comic book's chapters (image + TTS audio each) and stitches
 * them into a single vertical short with synced subtitles.
 */
export async function runComicPipeline(
  book: ComicBook,
  config: ComicPipelineConfig,
): Promise<ComicShortResult> {
  if (book.chapters.length === 0) {
    throw new Error("Comic book has no chapters to narrate");
  }
  for (const chapter of book.chapters) {
    const visual = chapter.videoPath ?? chapter.imagePath;
    if (!fs.existsSync(visual)) {
      throw new Error(`Chapter image not found: ${visual}`);
    }
  }

  const workDir = path.join(config.outputDir, "comics", book.id);
  fs.mkdirSync(workDir, { recursive: true });

  logger.info({ bookId: book.id, chapters: book.chapters.length }, "Narrating comic chapters");
  const narrated = config.narrate
    ? await config.narrate(book.chapters, workDir)
    : await narrateChapters(book.chapters, workDir, config.ttsVoice);

  const clipPaths: string[] = [];
  for (const chapter of narrated) {
    const clipPath = path.join(workDir, `${chapter.id}.clip.mp4`);
    if (config.renderChapter) {
      await config.renderChapter(chapter, clipPath);
    } else {
      await renderChapterClip(chapter, clipPath, config.verticalWidth, config.verticalHeight);
    }
    clipPaths.push(clipPath);
  }

  const concatPath = path.join(workDir, "concat.mp4");
  await concatChapterClips(clipPaths, concatPath, workDir);

  const { words, segments, totalDuration } = buildTimelineWords(narrated);
  const syntheticClip: ShortClip = {
    id: book.id,
    videoId: book.id,
    title: book.title,
    description: book.title,
    startTime: 0,
    endTime: totalDuration,
    duration: totalDuration,
    viralScore: 0,
    reason: "comic-narration",
    transcript: segments,
    words,
    hashtags: [],
  };
  const subtitlePath = path.join(workDir, `${book.id}.ass`);
  fs.writeFileSync(
    subtitlePath,
    config.buildSubtitles
      ? config.buildSubtitles(syntheticClip)
      : generateASSSubtitles(syntheticClip, config.verticalWidth, config.verticalHeight, config.watermarkText),
    "utf-8",
  );

  const outputPath = path.join(workDir, `${book.id}.mp4`);
  await burnSubtitles(
    concatPath,
    subtitlePath,
    outputPath,
    config.musicPath ? { path: config.musicPath, durationSec: totalDuration } : undefined,
  );

  // Narrated videos are not held to a Shorts length cap, but they are delivered:
  // normalise to the platform loudness and verify the file before it is returned.
  await finishDelivery(outputPath, {
    duration: totalDuration,
    width: config.verticalWidth,
    height: config.verticalHeight,
  }, DELIVERY_SPECS.custom);

  logger.info({ bookId: book.id, outputPath, totalDuration }, "Comic short generated");
  return {
    id: nanoid(8),
    bookTitle: book.title,
    outputPath,
    subtitlePath,
    durationSec: totalDuration,
    chapters: book.chapters.length,
  };
}
