import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../core/config.js";
import { logger } from "../core/logger.js";
import { pickBackgroundMusic } from "../core/audio-ducking.js";
import { runAnimatedPipeline } from "../core/animated/animated-pipeline.js";
import { buildAntonioCodeDemoBook } from "../core/animated/animated-demo.js";
import { resolveNarrationConfig } from "../core/animated/narration.js";
import type { AnimatedBook, StickStyle } from "../core/animated/animated-types.js";

const STYLES: readonly StickStyle[] = ["pop", "line"];

/**
 * `bun run cli generate:animated --demo` narrates the built-in Antonio Code smoke-test short;
 * `--book <path.json>` renders a user-supplied AnimatedBook instead.
 * `--style pop|line` picks A2 Modern Pop or B1 Minimal Line Art (default: the book's, else pop).
 */
export async function runAnimatedCommand(args: string[]): Promise<void> {
  const config = loadConfig();
  const bookIndex = args.indexOf("--book");
  const styleArg = args[args.indexOf("--style") + 1] as StickStyle;
  const style = args.includes("--style") && STYLES.includes(styleArg) ? styleArg : undefined;

  let book: AnimatedBook;
  if (args.includes("--demo")) {
    book = buildAntonioCodeDemoBook();
  } else if (bookIndex !== -1 && args[bookIndex + 1]) {
    book = JSON.parse(fs.readFileSync(path.resolve(args[bookIndex + 1]!), "utf-8"));
  } else {
    console.log("Usage: bun run cli generate:animated --demo | --book <path.json> [--style pop|line]");
    process.exit(1);
  }

  const result = await runAnimatedPipeline(book, {
    outputDir: config.outputDir,
    verticalWidth: config.verticalWidth,
    verticalHeight: config.verticalHeight,
    narration: resolveNarrationConfig(process.env),
    style,
    watermarkText: process.env.COMIC_WATERMARK_TEXT || undefined,
    musicPath: pickBackgroundMusic() ?? undefined,
  });

  logger.info(result, "generate:animated completed");
  console.log(`Short animado gerado: ${result.outputPath} (${result.durationSec.toFixed(1)}s, ${result.chapters} capítulos)`);
}
