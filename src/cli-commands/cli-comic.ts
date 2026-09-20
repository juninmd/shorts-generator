import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../core/config.js";
import { logger } from "../core/logger.js";
import { runComicPipeline } from "../core/comic/comic-pipeline.js";
import {
  buildFlashpointDemoBook,
  buildShrek1DemoBook,
  buildFlashEpisode1DemoBook,
  buildBiographyDemoBook,
  buildNewsDigestDemoBook,
  buildBookRecapDemoBook,
} from "../core/comic/demo-books.js";
import type { ComicBook } from "../core/comic/comic-types.js";

export type StoryKind = "comic" | "movie" | "series" | "bio" | "news" | "book";

const DEMO_BOOKS: Record<StoryKind, (workDir: string) => Promise<ComicBook>> = {
  comic: buildFlashpointDemoBook,
  movie: buildShrek1DemoBook,
  series: buildFlashEpisode1DemoBook,
  bio: buildBiographyDemoBook,
  news: buildNewsDigestDemoBook,
  book: buildBookRecapDemoBook,
};

/**
 * Shared narrated-shorts CLI for comics, movie recaps and series recaps —
 * they're all the same pipeline (image + narration per chapter, stitched
 * with synced subtitles); only the source book differs.
 *
 * `pnpm cli generate:<kind> --demo` (kind: comic, movie, series, bio, news, book)
 * narrates the built-in smoke-test book for that kind (Flashpoint / Shrek /
 * The Flash 1x01 / Ada Lovelace / example headlines / Dom Casmurro).
 * `--book <path.json>` narrates a user-supplied ComicBook definition instead.
 */
export async function runComicCommand(kind: StoryKind, args: string[]): Promise<void> {
  const config = loadConfig();
  const bookIndex = args.indexOf("--book");
  const isDemo = args.includes("--demo");

  let book: ComicBook;
  if (isDemo) {
    const demoDir = path.join(config.tempDir, `${kind}-demo`);
    book = await DEMO_BOOKS[kind](demoDir);
  } else if (bookIndex !== -1 && args[bookIndex + 1]) {
    const bookPath = path.resolve(args[bookIndex + 1]!);
    book = JSON.parse(fs.readFileSync(bookPath, "utf-8"));
  } else {
    console.log(`Usage: pnpm cli generate:${kind} --demo | --book <path.json>`);
    process.exit(1);
  }

  const result = await runComicPipeline(book, {
    outputDir: config.outputDir,
    verticalWidth: config.verticalWidth,
    verticalHeight: config.verticalHeight,
    ttsVoice: process.env.COMIC_TTS_VOICE || "pt-BR-AntonioNeural",
    watermarkText: process.env.COMIC_WATERMARK_TEXT || undefined,
  });

  logger.info(result, `generate:${kind} completed`);
  console.log(`Short gerado: ${result.outputPath} (${result.durationSec.toFixed(1)}s, ${result.chapters} capítulos)`);
}
