
import { loadConfig } from "../core/config.js";
import { runPipeline, runTopVideoPipeline } from "../core/pipeline.js";
import { logger } from "../core/logger.js";
import { runManagedChannel } from "./cli-managed.js";

export async function runGenerateCommand(command: string, args: string[]) {
  const isTopCmd = command === "generate:top";
  const urlIndex = args.indexOf("--url");
  const channelIndex = args.indexOf("--channel");
  const limitIndex = args.indexOf("--limit");
  const clipsIndex = args.indexOf("--clips");
  const targetShortsIndex = args.indexOf("--target-shorts");
  const fullCountIndex = args.indexOf("--full");
  const queryIndex = args.indexOf("--query");
  const managedChannelIndex = args.indexOf("--managed-channel");

  const overrides: Record<string, any> = {};

  if (urlIndex !== -1 && args[urlIndex + 1]) {
    const rawUrls = args[urlIndex + 1]!;
    overrides.specificUrls = rawUrls.split(",").map((u) => u.trim()).filter(Boolean);
    if (channelIndex === -1) overrides.channels = [];
  }

  if (channelIndex !== -1 && args[channelIndex + 1]) {
    const rawChannels = args[channelIndex + 1]!;
    overrides.channels = rawChannels.split(",").map((c) => c.trim()).filter(Boolean);
  }

  if (limitIndex !== -1 && args[limitIndex + 1]) {
    overrides.videoLimit = parseInt(args[limitIndex + 1]!, 10);
  }

  if (clipsIndex !== -1 && args[clipsIndex + 1]) {
    const n = parseInt(args[clipsIndex + 1]!, 10);
    if (!isNaN(n)) {
      overrides.maxClipsOverride = n;
      overrides.minShortsPerVideo = n;
      logger.info({ clipsRequested: n }, "🎯 Limite de cortes definido manualmente via --clips");
    }
  }

  if (targetShortsIndex !== -1 && args[targetShortsIndex + 1]) {
    const n = parseInt(args[targetShortsIndex + 1]!, 10);
    if (!isNaN(n) && n > 0) {
      overrides.targetShorts = n;
      logger.info({ targetShorts: n }, "🎯 Meta de shorts definida via --target-shorts");
    }
  }

  let topVideosCount = 1;
  if (fullCountIndex !== -1 && args[fullCountIndex + 1]) {
    const n = parseInt(args[fullCountIndex + 1]!, 10);
    if (!isNaN(n) && n > 0) {
      topVideosCount = n;
      overrides.fullVideoCount = n;
      logger.info({ fullVideoCount: n }, "🎯 Meta de vídeos completos definida via --full");
    }
  }

  if (queryIndex !== -1 && args[queryIndex + 1]) {
    overrides.videoQuery = args[queryIndex + 1]!;
    logger.info({ videoQuery: overrides.videoQuery }, "🔍 Filtro de título definido via --query");
  }

  const managedChannelId = managedChannelIndex !== -1 ? args[managedChannelIndex + 1]?.trim() : undefined;
  const baseConfig = loadConfig(overrides);

  if (managedChannelId) {
    if (isTopCmd) throw new Error("generate:top not supported yet for managed runs");
    await runManagedChannel(managedChannelId, baseConfig, overrides);
  } else {
    if (isTopCmd) {
      for (let i = 0; i < topVideosCount; i++) {
        logger.info(`Iniciando publicação de vídeo completo ${i + 1}/${topVideosCount}`);
        await runTopVideoPipeline(baseConfig, (progress) => {
          logger.info({ stage: progress.stage, progress: `${Math.round(progress.progress)}%`, message: progress.message }, "Top Video Pipeline status");
        });
      }
    } else {
      await runPipeline(baseConfig, (progress) => {
        logger.info({ stage: progress.stage, progress: `${Math.round(progress.progress)}%`, message: progress.message }, "Pipeline status");
      });
    }
  }
}
