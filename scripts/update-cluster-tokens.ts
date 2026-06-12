import { config as dotenvConfig } from "dotenv";
dotenvConfig();

import { getControlPlanePool } from "../src/core/control-plane-db.js";
import { createSecretStore } from "../src/core/secret-store.js";
import { loadControlPlaneConfig } from "../src/core/control-plane-config.js";
import { ChannelBundleRepository } from "../src/core/channel-bundle-repository.js";
import { logger } from "../src/core/logger.js";
import { randomUUID } from "node:crypto";

async function main() {
  const config = loadControlPlaneConfig();
  const db = getControlPlanePool(config);
  const secretStore = createSecretStore(config);
  const repo = new ChannelBundleRepository(db);

  const santidadeId = "santidade-catolica";
  const quizId = "quiz-channel";

  const santidadeRefreshToken = process.env.SANTIDADE_REFRESH_TOKEN!;
  const quizRefreshToken = process.env.QUIZ_REFRESH_TOKEN!;

  if (!santidadeRefreshToken || !quizRefreshToken) {
    throw new Error("Missing SANTIDADE_REFRESH_TOKEN or QUIZ_REFRESH_TOKEN in env");
  }

  const clientId = process.env.YOUTUBE_CLIENT_ID!;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET!;

  async function upsertChannel(id: string, slug: string, name: string, refreshToken: string, channelType: "cuts" | "quiz" = "cuts") {
    const existing = await repo.getBundle(id);
    const now = new Date().toISOString();

    const accountId = randomUUID();
    const encrypted = secretStore.encryptToken(id, accountId, refreshToken);

    const bundle = {
      channel: {
        id,
        slug,
        name,
        description: `Canal ${name}`,
        status: "active" as const,
        logoPath: null,
        watermarkText: name,
        channelType,
        createdAt: existing?.channel.createdAt || now,
        updatedAt: now,
      },
      profile: {
        channelId: id,
        videoLimit: 3,
        minShortDuration: 15,
        maxShortDuration: 59,
        targetShorts: 3,
        videoQuery: null,
        sortByViews: false,
        aiProvider: "openrouter",
        aiModel: "google/gemini-2.0-flash-lite-001",
      },
      focuses: (existing?.focuses || []).map(f => ({
        ...f,
        id: f.id,
        key: f.key || (f as any).focus_key,
        label: f.label || (f as any).focus_label
      })),
      sources: (existing?.sources || []).map(s => ({
        ...s,
        createdAt: s.createdAt || (s as any).created_at || now
      })),
      publishingAccounts: [
        {
          id: accountId,
          channelId: id,
          provider: "youtube",
          label: "Principal",
          status: "active" as const,
          accountIdentifier: name,
          clientId,
          clientSecret,
          encryptedToken: encrypted,
          createdAt: now,
          updatedAt: now,
        }
      ],
    };

    await repo.saveBundle(bundle);
    logger.info({ id, name, channelType }, "Channel upserted with YouTube credentials");
  }

  await upsertChannel(santidadeId, "santidade-catolica", "Santidade Católica", santidadeRefreshToken, "cuts");
  await upsertChannel(quizId, "quiz-channel", "Quiz Channel", quizRefreshToken, "quiz");

  await db.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
