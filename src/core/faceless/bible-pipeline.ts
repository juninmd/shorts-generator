import path from "node:path";
import type { PipelineConfig } from "../../types.js";
import { runComicPipeline } from "../comic/comic-pipeline.js";
import { logger } from "../logger.js";
import { generateBibleScript } from "./bible-script.js";
import { buildBibleMeta, type BibleShortMeta } from "./bible-meta.js";
import { bibleMusicCredit } from "./bible-music.js";
import { createFootageJudge } from "./footage-judge.js";
import { buildVerseCardBook } from "./verse-cards.js";
import { buildBibleStickBook } from "./bible-stick.js";
import { runAnimatedPipeline } from "../animated/animated-pipeline.js";
import type { NarrationConfig } from "../animated/narration.js";

export interface BibleOptions {
  language?: string;
  ttsVoice: string;
  musicPath?: string;
  pexelsApiKey?: string;
  watermarkText?: string;
  /** `footage` = Pexels clips with the verse overlaid (default); `stick` = stick-figure acting with the verse on a scroll. */
  visual?: "footage" | "stick";
  narration?: NarrationConfig;
}

/** Passagem em, short pronto + metadados de publicação fora: roteiro em atos → cards de versículo → narração + karaokê. */
export async function runBiblePipeline(
  passage: string,
  config: PipelineConfig,
  options: BibleOptions,
): Promise<BibleShortMeta> {
  const script = await generateBibleScript(passage, config, options.language);
  logger.info({ passage, title: script.title, scenes: script.scenes.length }, "Bible script ready");
  if (options.visual === "stick") {
    if (!options.narration) throw new Error("Stick bible short needs a narration config");
    const result = await runAnimatedPipeline(buildBibleStickBook(script), {
      outputDir: config.outputDir,
      verticalWidth: config.verticalWidth,
      verticalHeight: config.verticalHeight,
      narration: options.narration,
      style: "line",
      watermarkText: options.watermarkText,
      musicPath: options.musicPath,
    });
    return buildBibleMeta(script, result.outputPath, result.durationSec, config, bibleMusicCredit(options.musicPath));
  }
  const book = await buildVerseCardBook(script, path.join(config.tempDir, "bible"), options.pexelsApiKey, createFootageJudge(config));
  const result = await runComicPipeline(book, {
    outputDir: config.outputDir,
    verticalWidth: config.verticalWidth,
    verticalHeight: config.verticalHeight,
    ttsVoice: options.ttsVoice,
    watermarkText: options.watermarkText,
    musicPath: options.musicPath,
  });
  return buildBibleMeta(script, result.outputPath, result.durationSec, config, bibleMusicCredit(options.musicPath));
}
