import { config as dotenvConfig } from "dotenv";
dotenvConfig();

import { randomUUID } from "node:crypto";
import { getControlPlanePool } from "../src/core/control-plane-db.js";
import { createSecretStore } from "../src/core/secret-store.js";
import { loadControlPlaneConfig } from "../src/core/control-plane-config.js";
import { ChannelBundleRepository } from "../src/core/channel-bundle-repository.js";
import { upsertPublishingAccount } from "../src/core/publishing-accounts.js";
import { logger } from "../src/core/logger.js";
import type { PublishingAccount } from "../src/core/channel-domain.js";

/**
 * Rotates the YouTube refresh token of a managed channel.
 *
 * Run it with the token(s) you just minted, one env var per channel — only the
 * channels whose env var is set are touched:
 *
 *   $env:SANTIDADE_REFRESH_TOKEN = "1//..."
 *   $env:QUIZ_REFRESH_TOKEN      = "1//..."
 *   $env:AKITEMQUIZ_REFRESH_TOKEN = "1//..."
 *   npx tsx scripts/update-cluster-tokens.ts
 *
 * It preserves every other publishing account (Telegram, OpenRouter) and reuses
 * the existing YouTube account id, so it is safe to re-run.
 */
interface ChannelTarget {
  readonly id: string;
  readonly envToken: string;
}

const CHANNELS: readonly ChannelTarget[] = [
  { id: "santidade-catolica", envToken: "SANTIDADE_REFRESH_TOKEN" },
  { id: "quiz-channel", envToken: "QUIZ_REFRESH_TOKEN" },
  { id: "akitemquiz", envToken: "AKITEMQUIZ_REFRESH_TOKEN" },
];

async function main() {
  const pending = CHANNELS.filter((channel) => process.env[channel.envToken]?.trim());
  if (pending.length === 0) {
    throw new Error(
      `No refresh token provided. Set at least one of: ${CHANNELS.map((c) => c.envToken).join(", ")}`,
    );
  }

  const config = loadControlPlaneConfig();
  const db = getControlPlanePool(config);
  const secretStore = createSecretStore(config);
  const repo = new ChannelBundleRepository(db);

  const clientId = process.env.YOUTUBE_CLIENT_ID?.trim();
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET are required");
  }

  for (const channel of pending) {
    const refreshToken = process.env[channel.envToken]!.trim();
    const existing = await repo.getBundle(channel.id);
    if (!existing) {
      throw new Error(
        `Channel ${channel.id} not found in the control plane — create it in the admin panel first`,
      );
    }

    const current = existing.publishingAccounts.find((a) => a.provider === "youtube");
    const accountId = current?.id ?? randomUUID();
    const now = new Date().toISOString();

    const youtube: PublishingAccount = {
      id: accountId,
      channelId: channel.id,
      provider: "youtube",
      label: current?.label ?? "Principal",
      status: "active",
      accountIdentifier: current?.accountIdentifier ?? existing.channel.name,
      clientId,
      clientSecret,
      encryptedToken: secretStore.encryptToken(channel.id, accountId, refreshToken),
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    };

    await repo.saveBundle({
      ...existing,
      channel: { ...existing.channel, updatedAt: now },
      publishingAccounts: upsertPublishingAccount(existing.publishingAccounts, youtube),
    });

    logger.info(
      {
        channelId: channel.id,
        accountId,
        preservedProviders: existing.publishingAccounts
          .filter((a) => a.provider !== "youtube")
          .map((a) => a.provider),
      },
      "YouTube refresh token updated",
    );
  }

  await db.end();
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
