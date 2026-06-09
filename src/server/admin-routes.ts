import { Hono } from "hono";
import { google } from "googleapis";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ChannelBundleRepository } from "../core/channel-bundle-repository.js";
import { ChannelConfigResolver, buildManagedPipelineConfig } from "../core/channel-config-resolver.js";
import { loadConfig } from "../core/config.js";
import { tryLoadControlPlaneConfig } from "../core/control-plane-config.js";
import { getControlPlanePool } from "../core/control-plane-db.js";
import { logger } from "../core/logger.js";
import { ManagedRunRepository } from "../core/managed-run-repository.js";
import { createSecretStore } from "../core/secret-store.js";
import { runPipeline } from "../core/pipeline.js";
import { runQuizPipeline } from "../core/quiz/quiz-pipeline.js";
import type { PipelineResult } from "../types.js";
import { createAdminAuthMiddleware } from "./auth-middleware.js";

const channelIdSchema = z.string().min(3).max(80);
const focusSchema = z.object({
  id: z.string().min(1).optional(),
  key: z.enum(["politica", "catolicos", "musica", "filmes", "series", "jogos", "tecnologia"]),
  label: z.string().min(1).max(80),
});
const sourceSchema = z.object({
  id: z.string().min(1).optional(),
  kind: z.enum(["youtube_channel", "youtube_handle", "youtube_url"]),
  value: z.string().min(1).max(300),
  label: z.string().min(1).max(120),
});
const publishingAccountSchema = z.object({
  id: z.string().min(1).optional(),
  provider: z.enum(["youtube", "telegram", "openrouter"]),
  label: z.string().min(1).max(120),
  status: z.enum(["active", "inactive"]),
  accountIdentifier: z.string().min(1).max(200),
  clientId: z.string().min(1).optional(),
  clientSecret: z.string().min(1).optional(),
  refreshToken: z.string().min(1).optional(),
});
const bundleSchema = z.object({
  slug: z.string().min(3).max(80),
  name: z.string().min(1).max(120),
  description: z.string().min(1).max(500),
  status: z.enum(["active", "inactive"]),
  logoPath: z.string().max(260).nullable().optional(),
  watermarkText: z.string().min(1).max(120),
  channelType: z.enum(["cuts", "quiz"]).default("cuts"),
  profile: z.object({
    videoLimit: z.number().int().positive().max(50),
    minShortDuration: z.number().int().positive().max(120),
    maxShortDuration: z.number().int().positive().max(120),
    targetShorts: z.number().int().positive().max(100).nullable().optional(),
    videoQuery: z.string().max(160).nullable().optional(),
    sortByViews: z.boolean().default(false),
    aiProvider: z.enum(["openrouter", "ollama"]),
    aiModel: z.string().min(1).max(160),
  }),
  focuses: z.array(focusSchema).default([]),
  sources: z.array(sourceSchema).default([]),
  publishingAccounts: z.array(publishingAccountSchema).default([]),
});

export function registerAdminRoutes(app: Hono): void {
  const config = tryLoadControlPlaneConfig();
  if (!config) {
    return;
  }

  const admin = new Hono();
  const db = getControlPlanePool(config);
  const repository = new ChannelBundleRepository(db);
  const runRepository = new ManagedRunRepository(db);
  const secretStore = createSecretStore(config);
  const resolver = new ChannelConfigResolver(repository, secretStore);

  admin.use("/*", createAdminAuthMiddleware(config));

  admin.get("/channels", async (c) => {
    const bundles = await repository.listBundles();
    return c.json(bundles.map(toAdminBundleResponse));
  });

  admin.get("/channels/:channelId", async (c) => {
    const channelId = channelIdSchema.parse(c.req.param("channelId"));
    const bundle = await repository.getBundle(channelId);
    if (!bundle) {
      return c.json({ error: "Channel not found" }, 404);
    }
    return c.json(toAdminBundleResponse(bundle));
  });

  admin.put("/channels/:channelId", async (c) => {
    const adminId = "system";
    const channelId = channelIdSchema.parse(c.req.param("channelId"));
    const parsed = bundleSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      logger.warn({ channelId, action: "save" }, "Admin mutation failed");
      return c.json({ error: "Invalid request", details: parsed.error.flatten() }, 400);
    }

    const now = new Date().toISOString();
    const existing = await repository.getBundle(channelId);
    const payload = parsed.data;
    if (isCutsOnlyMode() && payload.channelType !== "cuts") {
      return c.json({ error: "Quiz channels are disabled while CHANNEL_FLOW_MODE=cuts" }, 409);
    }
    const publishingAccounts = payload.publishingAccounts.map((accountPayload: z.infer<typeof publishingAccountSchema>) =>
      buildPublishingAccount(channelId, accountPayload, existing, secretStore, now),
    );

    await repository.saveBundle({
      channel: {
        id: channelId,
        slug: payload.slug,
        name: payload.name,
        description: payload.description,
        status: payload.status,
        logoPath: payload.logoPath ?? null,
        watermarkText: payload.watermarkText,
        channelType: payload.channelType,
        createdAt: existing?.channel.createdAt ?? now,
        updatedAt: now,
      },
      profile: {
        channelId,
        videoLimit: payload.profile.videoLimit,
        minShortDuration: payload.profile.minShortDuration,
        maxShortDuration: payload.profile.maxShortDuration,
        targetShorts: payload.profile.targetShorts ?? null,
        videoQuery: payload.profile.videoQuery ?? null,
        sortByViews: payload.profile.sortByViews,
        aiProvider: payload.profile.aiProvider,
        aiModel: payload.profile.aiModel,
      },
      focuses: payload.focuses.map((focus: z.infer<typeof focusSchema>) => ({ id: focus.id ?? randomUUID(), key: focus.key, label: focus.label })),
      sources: payload.sources.map((source: z.infer<typeof sourceSchema>) => ({ id: source.id ?? randomUUID(), kind: source.kind, value: source.value, label: source.label, createdAt: existing?.channel.createdAt ?? now })),
      publishingAccounts,
    });

    logger.info({ adminId, channelId, action: existing ? "update" : "create" }, "Channel updated");
    return c.json({ status: "ok" });
  });

  admin.delete("/channels/:channelId", async (c) => {
    const adminId = "system";
    const channelId = channelIdSchema.parse(c.req.param("channelId"));
    await repository.deleteBundle(channelId);
    logger.info({ adminId, channelId, action: "delete" }, "Channel updated");
    return c.json({ status: "deleted" });
  });

  admin.post("/channels/:channelId/test-connection", async (c) => {
    const adminId = "system";
    const channelId = channelIdSchema.parse(c.req.param("channelId"));
    try {
      const resolved = await resolver.resolveRunConfig(`test-${channelId}`, channelId);
      const oauth2Client = new google.auth.OAuth2(resolved.publishingAccount.clientId ?? "", resolved.publishingAccount.clientSecret ?? "");
      oauth2Client.setCredentials({ refresh_token: resolved.publishingAccount.token });
      await oauth2Client.getAccessToken();
      return c.json({ status: "ok" });
    } catch (error) {
      logger.warn({ adminId, channelId, provider: "youtube", error }, "Channel connection test failed");
      return c.json({ error: "Connection test failed" }, 400);
    }
  });

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
          const result = await runQuizPipeline(configForRun, (progress) => {
            void runRepository.updateProgress(runId, {
              stage: progress.stage as any,
              progress: progress.progress,
              message: progress.message,
            });
          });
          const mappedResult: PipelineResult = {
            videoId: "quiz",
            videoTitle: result.quiz.tema,
            channelName: resolved.channel.name,
            shorts: [
              {
                id: "quiz-short",
                clip: {
                  id: "quiz-short",
                  videoId: "quiz",
                  title: result.quiz.tema,
                  description: result.quiz.fato_curioso,
                  startTime: 0,
                  endTime: 0,
                  duration: 0,
                  viralScore: 100,
                  reason: "Quiz",
                  transcript: [],
                  words: [],
                  hashtags: ["quiz"],
                },
                outputPath: result.outputPath,
                subtitlePath: "",
                originalVideoUrl: "",
                originalVideoTitle: "",
                channelName: resolved.channel.name,
                status: "completed",
                createdAt: new Date().toISOString(),
              },
            ],
            errors: [],
            processingTimeMs: 0,
          };
          await runRepository.completeRun(runId, [mappedResult]);
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

  app.route("/api/admin", admin);
  logger.info({ allowedOrigins: config.allowedOrigins }, "Protected admin routes registered");
}

function toAdminBundleResponse(bundle: Awaited<ReturnType<ChannelBundleRepository["getBundle"]>> extends infer T ? Exclude<T, null> : never) {
  return {
    channel: bundle.channel,
    profile: bundle.profile,
    focuses: bundle.focuses,
    sources: bundle.sources,
    publishingAccounts: bundle.publishingAccounts.map((account) => ({
      id: account.id,
      channelId: account.channelId,
      provider: account.provider,
      label: account.label,
      status: account.status,
      accountIdentifier: account.accountIdentifier,
      hasStoredToken: true,
      hasClientCredentials: !!account.clientId,
    })),
  };
}

function buildPublishingAccount(
  channelId: string,
  payload: z.infer<typeof publishingAccountSchema>,
  existing: Awaited<ReturnType<ChannelBundleRepository["getBundle"]>>,
  secretStore: ReturnType<typeof createSecretStore>,
  now: string,
) {
  const existingAccount = existing?.publishingAccounts.find((a) => a.provider === payload.provider);
  const accountId = payload.id ?? existingAccount?.id ?? randomUUID();
  const encryptedToken = payload.refreshToken
    ? secretStore.encryptToken(channelId, accountId, payload.refreshToken)
    : existingAccount?.encryptedToken;
  if (!encryptedToken) {
    throw new Error(`Publishing account token is required for provider: ${payload.provider}`);
  }
  return {
    id: accountId,
    channelId,
    provider: payload.provider,
    label: payload.label,
    status: payload.status,
    accountIdentifier: payload.accountIdentifier,
    clientId: payload.clientId ?? existingAccount?.clientId ?? null,
    clientSecret: payload.clientSecret ?? existingAccount?.clientSecret ?? null,
    encryptedToken,
    createdAt: existingAccount?.createdAt ?? now,
    updatedAt: now,
  };
}

function isCutsOnlyMode(): boolean {
  return process.env.CHANNEL_FLOW_MODE === "cuts";
}
