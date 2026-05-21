import type { PipelineConfig } from "../types.js";
import type { PublishingAccount, ResolvedChannelRun, ResolvedPublishingCredentials } from "./channel-domain.js";
import { loadConfig } from "./config.js";
import { logger } from "./logger.js";
import type { ChannelBundleRepository } from "./channel-bundle-repository.js";
import type { SecretStore } from "./secret-store.js";

export class ChannelConfigResolver {
  constructor(
    private readonly repository: ChannelBundleRepository,
    private readonly secretStore: SecretStore,
  ) {}

  async resolveRunConfig(runId: string, channelId: string): Promise<ResolvedChannelRun> {
    const bundle = await this.repository.getBundle(channelId);
    if (!bundle) {
      logger.error({ runId, channelId, missingEntity: "channel" }, "Run config invalid");
      throw new Error("Managed channel not found");
    }
    if (bundle.channel.status !== "active") {
      logger.error({ runId, channelId, missingEntity: "active-channel" }, "Run config invalid");
      throw new Error("Managed channel is inactive");
    }
    if (bundle.channel.channelType !== "quiz" && bundle.sources.length === 0) {
      logger.error({ runId, channelId, missingEntity: "source-target" }, "Run config invalid");
      throw new Error("Managed channel requires at least one source target");
    }

    const youtubeAccount = bundle.publishingAccounts.find((a) => a.provider === "youtube");
    const telegramAccount = bundle.publishingAccounts.find((a) => a.provider === "telegram");
    const openrouterAccount = bundle.publishingAccounts.find((a) => a.provider === "openrouter");

    if (!youtubeAccount) {
      logger.error({ runId, channelId, missingEntity: "publishing-account" }, "Run config invalid");
      throw new Error("Managed channel requires a YouTube publishing account");
    }

    const resolveCredentials = (account: PublishingAccount): ResolvedPublishingCredentials => ({
      provider: account.provider,
      accountId: account.id,
      channelId,
      accountIdentifier: account.accountIdentifier,
      token: this.secretStore.decryptToken(channelId, account.id, account.encryptedToken),
      clientId: account.clientId,
      clientSecret: account.clientSecret,
    });

    logger.info({ runId, channelId, sourceCount: bundle.sources.length }, "Run snapshot resolved");

    return {
      channel: bundle.channel,
      profile: bundle.profile,
      focuses: bundle.focuses,
      sources: bundle.sources,
      publishingAccount: resolveCredentials(youtubeAccount),
      telegramAccount: telegramAccount ? resolveCredentials(telegramAccount) : undefined,
      openrouterAccount: openrouterAccount ? resolveCredentials(openrouterAccount) : undefined,
      snapshotCreatedAt: new Date().toISOString(),
    };
  }
}

export function buildManagedPipelineConfig(
  baseConfig: PipelineConfig,
  runId: string,
  resolvedRun: ResolvedChannelRun,
): PipelineConfig {
  const focusQuery = resolvedRun.focuses.map((focus) => focus.label).join(" ").trim();
  return loadConfig({
    ...baseConfig,
    channels: resolvedRun.sources.map((source) => source.value),
    specificUrls: [],
    videoLimit: resolvedRun.profile.videoLimit,
    minShortDuration: resolvedRun.profile.minShortDuration,
    maxShortDuration: resolvedRun.profile.maxShortDuration,
    targetShorts: resolvedRun.profile.targetShorts ?? undefined,
    sortByViews: resolvedRun.profile.sortByViews,
    videoQuery: (resolvedRun.profile.videoQuery ?? focusQuery) || undefined,
    aiProvider: resolvedRun.profile.aiProvider,
    aiModel: resolvedRun.profile.aiModel,
    watermarkText: resolvedRun.channel.watermarkText,
    youtubeAuth: {
      clientId: resolvedRun.publishingAccount.clientId ?? "",
      clientSecret: resolvedRun.publishingAccount.clientSecret ?? "",
      refreshToken: resolvedRun.publishingAccount.token,
    },
    telegramBotToken: resolvedRun.telegramAccount?.token ?? baseConfig.telegramBotToken,
    telegramChatId: resolvedRun.telegramAccount?.accountIdentifier ?? baseConfig.telegramChatId,
    openrouterApiKey: resolvedRun.openrouterAccount?.token ?? baseConfig.openrouterApiKey,
    managedRun: {
      runId,
      channelId: resolvedRun.channel.id,
      channelName: resolvedRun.channel.name,
      accountId: resolvedRun.publishingAccount.accountId,
      focusLabels: resolvedRun.focuses.map((focus) => focus.label),
      logoPath: resolvedRun.channel.logoPath,
    },
  });
}
