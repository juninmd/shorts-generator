import path from "node:path";
import type { PipelineConfig } from "../../types.js";
import { runComicPipeline } from "../comic/comic-pipeline.js";
import { logger } from "../logger.js";
import { generateBibleScript } from "./bible-script.js";
import { buildBibleMeta, type BibleShortMeta } from "./bible-meta.js";
import { buildVerseCardBook } from "./verse-cards.js";

export interface BibleOptions {
  language?: string;
  ttsVoice: string;
  musicPath?: string;
  watermarkText?: string;
}

/** Passagem em, short pronto + metadados de publicação fora: roteiro em atos → cards de versículo → narração + karaokê. */
export async function runBiblePipeline(
  passage: string,
  config: PipelineConfig,
  options: BibleOptions,
): Promise<BibleShortMeta> {
  const script = await generateBibleScript(passage, config, options.language);
  logger.info({ passage, title: script.title, scenes: script.scenes.length }, "Bible script ready");
  const book = await buildVerseCardBook(script, path.join(config.tempDir, "bible"));
  const result = await runComicPipeline(book, {
    outputDir: config.outputDir,
    verticalWidth: config.verticalWidth,
    verticalHeight: config.verticalHeight,
    ttsVoice: options.ttsVoice,
    watermarkText: options.watermarkText,
    musicPath: options.musicPath,
  });
  return buildBibleMeta(script, result.outputPath, result.durationSec, config);
}
