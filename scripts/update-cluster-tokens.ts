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

  const santidadeRefreshToken = "1//0hpJtb6AIeRqiCgYIARAAGBESNwF-L9IruL1El1UgkFKPmTvWoMSAKVnxkPNYYJZVuNnxu3VNQb8I4djZ6Y6JggMmLtY_Mc_4_BgQ";
  const quizRefreshToken = "1//0hqhJyE_O_cT3CgYIARAAGBESNwF-L9Ir-9WzPPnvOH4dklOAEPRkyy9HxHh8ejpYFUmfpAZOF51A3FFtwWfROOH94iLUc0-8CRAo";

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
      focuses: existing?.focuses || [],
      sources: existing?.sources || [],
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

  await upsertChannel(santidadeId, "santidade-catolica", "Santidade CatÃ³lica", santidadeRefreshToken, "cuts");
  await upsertChannel(quizId, "quiz-channel", "Quiz Channel", quizRefreshToken, "quiz");

  await db.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
