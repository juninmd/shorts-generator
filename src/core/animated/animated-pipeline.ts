import path from "node:path";
import fs from "node:fs";
import type { ComicChapter, ComicShortResult, NarratedChapter } from "../comic/comic-types.js";
import { runComicPipeline } from "../comic/comic-pipeline.js";
import type { AnimatedBook, StickChapter, StickStyle } from "./animated-types.js";
import { narrateAnimatedChapters, type NarrationConfig } from "./narration.js";
import { renderStickClip, renderStickPoster } from "./stick-render.js";

const FPS = 30;
const LAYOUT_WIDTH = 1080;
const LAYOUT_HEIGHT = 1920;

export interface AnimatedPipelineConfig {
  outputDir: string;
  verticalWidth: number;
  verticalHeight: number;
  narration: NarrationConfig;
  /** Overrides the book's style. */
  style?: StickStyle;
  watermarkText?: string;
  musicPath?: string;
}

/** Captions are drawn inside each chapter in the style's own typography, so the final burn adds none. */
export function captionFreeSubtitles(width: number, height: number): string {
  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    "",
  ].join("\n");
}

/**
 * Animated stick-figure short: each chapter is an acted scene (poses, faces, props on cue words,
 * captions and effects), narrated (ElevenLabs, edge-tts or silent) and stitched by the comic pipeline.
 */
export async function runAnimatedPipeline(
  book: AnimatedBook,
  config: AnimatedPipelineConfig,
): Promise<ComicShortResult> {
  if (book.chapters.length === 0) throw new Error("Animated book has no chapters");
  // The stick layouts (figure, props, heading and caption positions) are drawn for 1080x1920 only.
  if (config.verticalWidth !== LAYOUT_WIDTH || config.verticalHeight !== LAYOUT_HEIGHT) {
    throw new Error(`Animated shorts need ${LAYOUT_WIDTH}x${LAYOUT_HEIGHT}, got ${config.verticalWidth}x${config.verticalHeight}`);
  }
  const style: StickStyle = config.style ?? book.style ?? "pop";
  const size = { width: config.verticalWidth, height: config.verticalHeight, fps: FPS };
  const id = `${book.id}-${style}`;
  const workDir = path.join(config.outputDir, "animated", id);
  fs.mkdirSync(workDir, { recursive: true });

  const chapters: StickChapter[] = [];
  for (const chapter of book.chapters) {
    const posterPath = path.join(workDir, `${chapter.id}.poster.png`);
    await renderStickPoster(chapter, style, posterPath, size);
    chapters.push({ ...chapter, imagePath: posterPath });
  }

  const byId = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  const stickFor = (narrated: NarratedChapter): StickChapter => {
    const chapter = byId.get(narrated.id);
    if (!chapter) throw new Error(`Unknown animated chapter: ${narrated.id}`);
    return chapter;
  };

  return runComicPipeline(
    { id, title: book.title, chapters },
    {
      outputDir: config.outputDir,
      verticalWidth: config.verticalWidth,
      verticalHeight: config.verticalHeight,
      ttsVoice: config.narration.edgeVoice,
      watermarkText: config.watermarkText,
      musicPath: config.musicPath,
      narrate: (list: ComicChapter[], dir: string) => narrateAnimatedChapters(list, dir, config.narration),
      renderChapter: async (narrated, clipPath) =>
        renderStickClip(stickFor(narrated), style, narrated, clipPath, size),
      buildSubtitles: () => captionFreeSubtitles(config.verticalWidth, config.verticalHeight),
    },
  );
}
