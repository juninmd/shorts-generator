import { loadManagedConfig } from "../core/managed-config.js";
import { pickBibleMusic } from "../core/faceless/bible-music.js";
import { logger } from "../core/logger.js";
import { pickDailyPassage } from "../core/faceless/bible-daily.js";
import { runBiblePipeline } from "../core/faceless/bible-pipeline.js";
import { resolveNarrationConfig } from "../core/animated/narration.js";
import { publishBiblePreview, sendBiblePreview } from "../core/faceless/bible-preview.js";

const arg = (args: string[], name: string): string | undefined => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};

/**
 * `generate:bible --passage "Lucas 15,11-24" --managed-channel santidade-catolica`
 *   gera o short, envia o card de aprovação ao Telegram e grava `<video>.publish.json`.
 * `generate:bible --publish <video>.publish.json --managed-channel santidade-catolica`
 *   publica o preview aprovado no YouTube (upload + comentário com os links do canal).
 */
export async function runBibleCommand(args: string[]): Promise<void> {
  const channelId = arg(args, "--managed-channel");
  const passageArg = arg(args, "--passage");
  // `--passage auto` escolhe a passagem do dia (rotação fixa), para rodar em CronJob.
  const passage = passageArg === "auto" ? pickDailyPassage(new Date()) : passageArg;
  const publish = arg(args, "--publish");
  if (!channelId || (!passage && !publish)) {
    console.log('Usage: generate:bible --managed-channel <id> (--passage "Livro 1,1-10" [--visual stick] | --publish <arquivo.publish.json>)');
    process.exit(1);
  }

  // Voz calma e trilha discreta por padrão (sobrescreva com COMIC_TTS_VOICE / COMIC_TTS_RATE / BGM_VOLUME).
  process.env.COMIC_TTS_RATE ??= "-8%";
  process.env.BGM_VOLUME ??= "0.25";
  const config = await loadManagedConfig(channelId);

  if (publish) {
    const url = await publishBiblePreview(publish, config);
    logger.info({ url }, "generate:bible published");
    console.log(`Publicado: ${url}`);
    return;
  }

  const meta = await runBiblePipeline(passage!, config, {
    language: arg(args, "--lang"),
    ttsVoice: process.env.COMIC_TTS_VOICE || "pt-BR-ThalitaMultilingualNeural",
    pexelsApiKey: process.env.PEXELS_API_KEY || undefined,
    musicPath: pickBibleMusic(),
    watermarkText: config.watermarkText,
    visual: arg(args, "--visual") === "stick" ? "stick" : "footage",
    narration: resolveNarrationConfig(process.env),
  });
  const sidecar = await sendBiblePreview(meta, config);
  logger.info({ videoPath: meta.videoPath, sidecar }, "generate:bible preview sent");
  console.log(`Prévia enviada ao Telegram. Vídeo: ${meta.videoPath}\nPara publicar: --publish ${sidecar}`);
}
