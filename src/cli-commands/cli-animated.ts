import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../core/config.js";
import { logger } from "../core/logger.js";
import { pickBackgroundMusic } from "../core/audio-ducking.js";
import { runAnimatedPipeline } from "../core/animated/animated-pipeline.js";
import { buildAntonioCodeDemoBook } from "../core/animated/animated-demo.js";
import { resolveNarrationConfig } from "../core/animated/narration.js";
import type { AnimatedBook, StickStyle } from "../core/animated/animated-types.js";
import {
  buildAnimatedMeta, fetchFeedEntries, generateAnimatedScript, scriptToBook, styleForDate,
} from "../core/animated/animated-topic.js";
import { loadManagedConfig } from "../core/managed-config.js";
import { sendBiblePreview } from "../core/faceless/bible-preview.js";

const STYLES: readonly StickStyle[] = ["pop", "line"];

/**
 * `bun run cli generate:animated --demo` narrates the built-in Antonio Code smoke-test short;
 * `--book <path.json>` renders a user-supplied AnimatedBook instead.
 * `--daily [--managed-channel <id>]` escreve o roteiro do dia (tema: boas práticas de código e IA, o feed do
 * evo-agent só sugere), renderiza e envia a prévia ao Telegram; a publicação sai pelo botão de aprovação.
 * `--style pop|line` picks A2 Modern Pop or B1 Minimal Line Art (default: the book's, else pop).
 */
export async function runAnimatedCommand(args: string[]): Promise<void> {
  const config = loadConfig();
  const bookIndex = args.indexOf("--book");
  const styleArg = args[args.indexOf("--style") + 1] as StickStyle;
  const style = args.includes("--style") && STYLES.includes(styleArg) ? styleArg : undefined;

  const channelIndex = args.indexOf("--managed-channel");
  const channelId = channelIndex !== -1 ? args[channelIndex + 1] : undefined;
  const daily = args.includes("--daily");
  const now = new Date();
  const dayStyle = style ?? styleForDate(now);
  const pipelineConfig = daily && channelId ? await loadManagedConfig(channelId) : config;
  let dailyScript: Awaited<ReturnType<typeof generateAnimatedScript>> | undefined;
  let source: Awaited<ReturnType<typeof fetchFeedEntries>>[number] | undefined;

  let book: AnimatedBook;
  if (daily) {
    // Feed fora do ar não derruba o short: o tema é fixo, o feed só sugere.
    const entries = await fetchFeedEntries().catch((error) => {
      logger.warn({ error: error instanceof Error ? error.message : String(error) }, "evo-agent feed indisponível");
      return [];
    });
    dailyScript = await generateAnimatedScript(entries, pipelineConfig, now.toLocaleDateString("pt-BR"));
    source = entries[0];
    book = scriptToBook(dailyScript, `antonio-code-${now.toISOString().slice(0, 10)}`, dayStyle);
  } else if (args.includes("--demo")) {
    book = buildAntonioCodeDemoBook();
  } else if (bookIndex !== -1 && args[bookIndex + 1]) {
    book = JSON.parse(fs.readFileSync(path.resolve(args[bookIndex + 1]!), "utf-8"));
  } else {
    console.log("Usage: bun run cli generate:animated --demo | --book <path.json> | --daily [--managed-channel <id>] [--style pop|line]");
    process.exit(1);
  }

  const result = await runAnimatedPipeline(book, {
    outputDir: config.outputDir,
    verticalWidth: config.verticalWidth,
    verticalHeight: config.verticalHeight,
    narration: resolveNarrationConfig(process.env),
    style: daily ? dayStyle : style,
    watermarkText: process.env.COMIC_WATERMARK_TEXT || undefined,
    musicPath: pickBackgroundMusic() ?? undefined,
  });

  logger.info(result, "generate:animated completed");
  if (daily && dailyScript) {
    const meta = buildAnimatedMeta(dailyScript, result.outputPath, result.durationSec, pipelineConfig, source);
    const sidecar = await sendBiblePreview(meta, pipelineConfig);
    console.log(`Prévia enviada ao Telegram (${dayStyle}). Vídeo: ${result.outputPath}\nPara publicar: --publish ${sidecar}`);
    return;
  }
  console.log(`Short animado gerado: ${result.outputPath} (${result.durationSec.toFixed(1)}s, ${result.chapters} capítulos)`);
}
