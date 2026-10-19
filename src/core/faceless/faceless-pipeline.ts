import path from "node:path";
import { nanoid } from "nanoid";
import type { PipelineConfig } from "../../types.js";
import type { ComicBook, ComicShortResult } from "../comic/comic-types.js";
import { runComicPipeline } from "../comic/comic-pipeline.js";
import { buildColorCardBook, type DemoChapter } from "../comic/demo-books-utils.js";
import { logger } from "../logger.js";
import { generateFacelessScript, type FacelessScript } from "./faceless-script.js";
import { fetchSceneFootage } from "./stock-footage.js";

export interface FacelessOptions {
  language?: string;
  ttsVoice: string;
  pexelsApiKey?: string;
  musicPath?: string;
  watermarkText?: string;
}

/**
 * Turns a script into a narrated book whose chapters show stock footage; scenes
 * without footage (no API key, no match) fall back to a plain color card.
 */
export async function buildFacelessBook(
  script: FacelessScript,
  workDir: string,
  pexelsApiKey?: string,
): Promise<ComicBook> {
  const id = `faceless-${nanoid(6)}`;
  const used = new Set<number>();
  const scenes: (DemoChapter & { videoPath: string | null })[] = [];
  for (const [index, scene] of script.scenes.entries()) {
    const sceneId = `scene${index + 1}`;
    const videoPath = await fetchSceneFootage(
      scene.keywords, path.join(workDir, `${sceneId}.mp4`), pexelsApiKey, used,
    );
    scenes.push({ id: sceneId, title: scene.keywords, narrationText: scene.narration, videoPath });
  }
  const cards = await buildColorCardBook(workDir, id, script.title, scenes);
  return {
    id,
    title: script.title,
    chapters: cards.chapters.map((chapter, index) => ({
      ...chapter,
      videoPath: scenes[index]!.videoPath ?? undefined,
    })),
  };
}

/** Topic in, finished vertical short out: script → footage → narration → karaoke + ducked music. */
export async function runFacelessPipeline(
  topic: string,
  config: PipelineConfig,
  options: FacelessOptions,
): Promise<ComicShortResult> {
  const script = await generateFacelessScript(topic, config, options.language);
  logger.info({ topic, title: script.title, scenes: script.scenes.length }, "Faceless script ready");
  const book = await buildFacelessBook(
    script, path.join(config.tempDir, "faceless"), options.pexelsApiKey,
  );
  return runComicPipeline(book, {
    outputDir: config.outputDir,
    verticalWidth: config.verticalWidth,
    verticalHeight: config.verticalHeight,
    ttsVoice: options.ttsVoice,
    watermarkText: options.watermarkText,
    musicPath: options.musicPath,
  });
}
