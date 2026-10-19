import { loadConfig } from "../core/config.js";
import { logger } from "../core/logger.js";
import { pickBackgroundMusic } from "../core/audio-ducking.js";
import { runFacelessPipeline } from "../core/faceless/faceless-pipeline.js";

/**
 * `pnpm cli generate:faceless --topic "..." [--lang pt-BR]` — LLM script,
 * stock footage (PEXELS_API_KEY; plain cards without it), edge-tts narration,
 * karaoke captions and optional ducked background music (BGM_FILE / BGM_DIR).
 */
export async function runFacelessCommand(args: string[]): Promise<void> {
  const topicIndex = args.indexOf("--topic");
  const topic = topicIndex !== -1 ? args[topicIndex + 1] : undefined;
  if (!topic) {
    console.log('Usage: pnpm cli generate:faceless --topic "assunto do vídeo" [--lang pt-BR]');
    process.exit(1);
  }
  const langIndex = args.indexOf("--lang");

  const result = await runFacelessPipeline(topic, loadConfig(), {
    language: langIndex !== -1 ? args[langIndex + 1] : undefined,
    ttsVoice: process.env.COMIC_TTS_VOICE || "pt-BR-AntonioNeural",
    pexelsApiKey: process.env.PEXELS_API_KEY || undefined,
    musicPath: pickBackgroundMusic() ?? undefined,
    watermarkText: process.env.COMIC_WATERMARK_TEXT || undefined,
  });

  logger.info(result, "generate:faceless completed");
  console.log(`Short gerado: ${result.outputPath} (${result.durationSec.toFixed(1)}s, ${result.chapters} cenas)`);
}
