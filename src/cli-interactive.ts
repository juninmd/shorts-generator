import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { loadConfig } from "./core/config.js";
import { runPipeline } from "./core/pipeline.js";
import { logger } from "./core/logger.js";

async function ask(rl: Awaited<ReturnType<typeof createInterface>>, question: string, defaultVal = ""): Promise<string> {
  const hint = defaultVal ? ` [${defaultVal}]` : "";
  const answer = (await rl.question(`  ${question}${hint}: `)).trim();
  return answer || defaultVal;
}

async function pickMenu(rl: Awaited<ReturnType<typeof createInterface>>, options: string[]): Promise<number> {
  options.forEach((opt, i) => console.log(`  ${i + 1}. ${opt}`));
  while (true) {
    const raw = (await rl.question(`\n  Escolha [1-${options.length}]: `)).trim();
    const n = parseInt(raw, 10);
    if (n >= 1 && n <= options.length) return n;
    console.log(`  ⚠️  Digite um número entre 1 e ${options.length}.`);
  }
}

export async function runInteractive(): Promise<void> {
  const rl = createInterface({ input, output });

  console.log(`
╔══════════════════════════════════════════════╗
║         🎬 Shorts Generator CLI              ║
╚══════════════════════════════════════════════╝
`);

  console.log("Modo de operação:\n");
  const mode = await pickMenu(rl, [
    "Vídeos de um canal (mais recentes)",
    "Vídeos de um canal (mais visualizados)",
    "Vídeo por URL específica",
  ]);

  const overrides: Record<string, unknown> = {};

  if (mode === 1 || mode === 2) {
    console.log();
    const rawChannels = await ask(rl, "Canal(is) — ex: @MissaDiaria,@OutroCanal");
    if (!rawChannels) {
      console.error("  ❌ Nenhum canal informado.");
      rl.close();
      process.exit(1);
    }
    overrides.channels = rawChannels.split(",").map((c) => c.trim()).filter(Boolean);
    overrides.specificUrls = [];

    const limitRaw = await ask(rl, "Quantos vídeos por canal?", "1");
    overrides.videoLimit = Math.max(1, parseInt(limitRaw, 10) || 1);

    if (mode === 2) overrides.sortByViews = true;
  } else {
    console.log();
    const rawUrls = await ask(rl, "URL(s) — separadas por vírgula");
    if (!rawUrls) {
      console.error("  ❌ Nenhuma URL informada.");
      rl.close();
      process.exit(1);
    }
    overrides.specificUrls = rawUrls.split(",").map((u) => u.trim()).filter(Boolean);
    overrides.channels = [];
  }

  const clipsRaw = await ask(rl, "Quantos cortes por vídeo?", "AUTO");
  if (clipsRaw !== "AUTO") {
    const n = parseInt(clipsRaw, 10);
    if (!isNaN(n) && n > 0) {
      overrides.maxClipsOverride = n;
      overrides.minShortsPerVideo = n;
    }
  }

  rl.close();
  console.log();

  const config = loadConfig(overrides);

  if (config.channels.length === 0 && config.specificUrls.length === 0) {
    logger.error("Nenhum canal ou URL encontrado. Verifique as entradas.");
    process.exit(1);
  }

  logger.info(
    { channels: config.channels, urls: config.specificUrls, videoLimit: config.videoLimit, sortByViews: config.sortByViews ?? false },
    "🚀 Iniciando geração de shorts",
  );

  const results = await runPipeline(config, (progress) => {
    logger.info(
      { stage: progress.stage, progress: `${Math.round(progress.progress)}%`, message: progress.message },
      "Pipeline status",
    );
  });

  const totalShorts = results.reduce((sum, r) => sum + r.shorts.length, 0);
  const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

  logger.info(
    { videosProcessed: results.length, totalShorts, totalErrors },
    "✅ Pipeline finalizada",
  );

  if (totalErrors > 0 && totalShorts === 0) {
    logger.error("Execução falhou (0 shorts gerados). Verifique os erros acima.");
    process.exit(1);
  }
}
