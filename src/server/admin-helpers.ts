import { randomUUID } from "node:crypto";
import type { z } from "zod";
import type { ChannelBundleRepository } from "../core/channel-bundle-repository.js";
import type { ChannelConfigResolver } from "../core/channel-config-resolver.js";
import type { ManagedRunRepository } from "../core/managed-run-repository.js";
import type { createSecretStore } from "../core/secret-store.js";
import type { runQuizPipeline } from "../core/quiz/quiz-pipeline.js";
import type { PipelineResult } from "../types.js";
import type { publishingAccountSchema } from "./admin-schemas.js";

export interface AdminDeps {
  repository: ChannelBundleRepository;
  runRepository: ManagedRunRepository;
  secretStore: ReturnType<typeof createSecretStore>;
  resolver: ChannelConfigResolver;
}

type Bundle = Awaited<ReturnType<ChannelBundleRepository["getBundle"]>> extends infer T
  ? Exclude<T, null>
  : never;

export function toAdminBundleResponse(bundle: Bundle) {
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

export function buildPublishingAccount(
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

export function mapQuizResultToPipeline(
  result: Awaited<ReturnType<typeof runQuizPipeline>>,
  channelName: string,
): PipelineResult {
  return {
    videoId: "quiz",
    videoTitle: result.quiz.tema,
    channelName,
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
        channelName,
        status: "completed",
        createdAt: new Date().toISOString(),
      },
    ],
    errors: [],
    processingTimeMs: 0,
  };
}

export function isCutsOnlyMode(): boolean {
  return process.env.CHANNEL_FLOW_MODE === "cuts";
}
