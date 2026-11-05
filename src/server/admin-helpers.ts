

import { randomUUID } from "node:crypto";
import type { z } from "zod";
import type { ChannelBundleRepository } from "../core/channel-bundle-repository.js";
import type { ChannelConfigResolver } from "../core/channel-config-resolver.js";
import type { DurableRunRepository } from "../core/runs/durable-run-repository.js";
import type { RunJobData } from "../core/runs/run-queue.js";
import type { PublicationRepository } from "../core/publication/publication-repository.js";
import type { PublicationJobData } from "../core/publication/publication-queue.js";
import type { QuizBankRepository } from "../core/quiz/quiz-bank-repository.js";
import type { SqlClient } from "../core/control-plane-db.js";
import type { createSecretStore } from "../core/secret-store.js";
import type { publishingAccountSchema } from "./admin-schemas.js";

export interface AdminDeps {
  repository: ChannelBundleRepository;
  runRepository: DurableRunRepository;
  publications?: PublicationRepository;
  quizBank?: QuizBankRepository;
  decisionsDb?: SqlClient;
  enqueueRun?: (data: RunJobData, attempt?: string | number) => Promise<void>;
  enqueuePublication?: (data: PublicationJobData) => Promise<void>;
  enqueueRegeneration?: (data: PublicationJobData) => Promise<void>;
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

export { mapQuizResultToPipeline } from "../core/runs/quiz-result.js";

export function isCutsOnlyMode(): boolean {
  return process.env.CHANNEL_FLOW_MODE === "cuts";
}



