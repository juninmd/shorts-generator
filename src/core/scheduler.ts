import cron from "node-cron";
import { logger } from "./logger.js";
import { loadConfig } from "./config.js";
import { runPipeline } from "./pipeline.js";

/**
 * Starts the background scheduler for the Catholic Radar.
 * Runs every 8 hours: 00:00, 08:00, 16:00.
 */
export function startScheduler() {
  logger.info("📡 Agendador de Radar Católico iniciado (a cada 8 horas)");

  // Schedule: 0 0,8,16 * * * (At 00:00, 08:00, and 16:00)
  cron.schedule("0 0,8,16 * * *", async () => {
    logger.info("🚀 Iniciando execução agendada do Radar Católico...");
    
    try {
      const config = loadConfig({
        catholicRadar: true,
        videoLimit: 2, // Limit per guest to not overload
      });

      const results = await runPipeline(config, (progress) => {
        logger.debug({ stage: progress.stage, message: progress.message }, "Scheduled Radar Status");
      });

      const totalShorts = results.reduce((sum, r) => sum + r.shorts.length, 0);
      logger.info({ totalShorts }, "✅ Radar Católico agendado finalizado com sucesso");
    } catch (error) {
      logger.error({ error }, "❌ Erro na execução agendada do Radar Católico");
    }
  });
}
