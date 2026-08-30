
import { loadConfig } from "../core/config.js";
import { runQuizPipeline } from "../core/quiz/quiz-pipeline.js";
import { logger } from "../core/logger.js";
import { runQuizManagedChannel } from "./cli-managed.js";

export async function runQuizCommand(args: string[]) {
  const promptIndex = args.indexOf("--prompt");
  const managedChannelIndex = args.indexOf("--managed-channel");

  const prompt = promptIndex !== -1 && args[promptIndex + 1] ? args[promptIndex + 1] : undefined;
  const managedChannelId = managedChannelIndex !== -1 ? args[managedChannelIndex + 1]?.trim() : undefined;

  const baseConfig = loadConfig();

  if (managedChannelId) {
    await runQuizManagedChannel(managedChannelId, prompt, baseConfig);
  } else {
    const result = await runQuizPipeline(baseConfig, async (progress) => {
      logger.info({ stage: progress.stage, progress: `${Math.round(progress.progress)}%`, message: progress.message }, "Quiz Pipeline status");
    }, prompt);
    logger.info({ success: result.success, youtubeUrl: result.youtubeUrl }, "✅ Quiz pipeline completed");
  }
}
