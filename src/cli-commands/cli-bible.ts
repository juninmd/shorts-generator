import { randomUUID } from "node:crypto";
import { ChannelAffiliateRepository } from "../core/channel-affiliate-repository.js";
import { ChannelBundleRepository } from "../core/channel-bundle-repository.js";
import { ChannelConfigResolver, buildManagedPipelineConfig } from "../core/channel-config-resolver.js";
import { loadConfig } from "../core/config.js";
import { loadControlPlaneConfig } from "../core/control-plane-config.js";
import { getControlPlanePool } from "../core/control-plane-db.js";
import { createSecretStore } from "../core/secret-store.js";
import { pickBackgroundMusic } from "../core/audio-ducking.js";
import { logger } from "../core/logger.js";
import { runBiblePipeline } from "../core/faceless/bible-pipeline.js";
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
  const passage = arg(args, "--passage");
  const publish = arg(args, "--publish");
  if (!channelId || (!passage && !publish)) {
    console.log('Usage: generate:bible --managed-channel <id> (--passage "Livro 1,1-10" | --publish <arquivo.publish.json>)');
    process.exit(1);
  }

  const controlPlane = loadControlPlaneConfig();
  const db = getControlPlanePool(controlPlane) as any;
  const resolver = new ChannelConfigResolver(
    new ChannelBundleRepository(db), createSecretStore(controlPlane), new ChannelAffiliateRepository(db),
  );
  const resolved = await resolver.resolveRunConfig(randomUUID(), channelId);
  const config = buildManagedPipelineConfig(loadConfig(), randomUUID(), resolved);

  if (publish) {
    const url = await publishBiblePreview(publish, config);
    logger.info({ url }, "generate:bible published");
    console.log(`Publicado: ${url}`);
    return;
  }

  const meta = await runBiblePipeline(passage!, config, {
    language: arg(args, "--lang"),
    ttsVoice: process.env.COMIC_TTS_VOICE || "pt-BR-AntonioNeural",
    pexelsApiKey: process.env.PEXELS_API_KEY || undefined,
    musicPath: pickBackgroundMusic() ?? undefined,
    watermarkText: config.watermarkText,
  });
  const sidecar = await sendBiblePreview(meta, config);
  logger.info({ videoPath: meta.videoPath, sidecar }, "generate:bible preview sent");
  console.log(`Prévia enviada ao Telegram. Vídeo: ${meta.videoPath}\nPara publicar: --publish ${sidecar}`);
}
