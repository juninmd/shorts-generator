

import type { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { buildManagedPipelineConfig } from "../core/channel-config-resolver.js";
import { loadConfig } from "../core/config.js";
import { logger } from "../core/logger.js";
import { runPipeline } from "../core/pipeline.js";
import { runQuizPipeline } from "../core/quiz/quiz-pipeline.js";
import { channelIdSchema } from "./admin-schemas.js";
import { type AdminDeps, isCutsOnlyMode, mapQuizResultToPipeline } from "./admin-helpers.js";

export function registerRunRoutes(admin: Hono, deps: AdminDeps): void {
  const { runRepository, resolver } = deps;

  admin.post("/channels/:channelId/runs", async (c) => {
    const adminId = "system";
    const channelId = channelIdSchema.parse(c.req.param("channelId"));
    const runId = randomUUID();
    const resolved = await resolver.resolveRunConfig(runId, channelId);
    if (isCutsOnlyMode() && resolved.channel.channelType !== "cuts") {
      return c.json({ error: "Quiz runs are disabled while CHANNEL_FLOW_MODE=cuts" }, 409);
    }
    await runRepository.createRun(runId, channelId, adminId, {
      channel: resolved.channel,
      profile: resolved.profile,
      focuses: resolved.focuses,
      sources: resolved.sources,
      youtubeAccount: {
        id: resolved.publishingAccount.accountId,
        provider: resolved.publishingAccount.provider,
        label: resolved.channel.name,
        status: resolved.channel.status,
        accountIdentifier: resolved.publishingAccount.accountIdentifier,
      },
    });

    const configForRun = buildManagedPipelineConfig(loadConfig(), runId, resolved);
    void (async () => {
      try {
        if (resolved.channel.channelType === "quiz") {
          const result = await runQuizPipeline(configForRun, async (progress) => {
            await runRepository.updateProgress(runId, {
              stage: progress.stage as any,
              progress: progress.progress,
              message: progress.message,
            }).catch(() => {});
          });
          await runRepository.completeRun(runId, [mapQuizResultToPipeline(result, resolved.channel.name)]);
        } else {
          const results = await runPipeline(configForRun, (progress) => {
            void runRepository.updateProgress(runId, progress);
          });
          await runRepository.completeRun(runId, results);
        }
      } catch (error) {
        await runRepository.failRun(runId, error);
      }
    })();

    logger.info({ adminId, channelId, action: "run" }, "Channel updated");
    return c.json({ runId, status: "processing" }, 202);
  });

  admin.get("/runs", async (c) => {
    const channelId = c.req.query("channelId") || undefined;
    const limit = Number(c.req.query("limit") || "20");
    const offset = Number(c.req.query("offset") || "0");
    return c.json(await runRepository.listRuns(channelId, limit, offset));
  });

  admin.get("/runs/:runId", async (c) => {
    const run = await runRepository.getRun(c.req.param("runId"));
    if (!run) {
      return c.json({ error: "Run not found" }, 404);
    }
    return c.json(run);
  });
}



