import { randomUUID } from "node:crypto";
import { ChannelBundleRepository } from "../src/core/channel-bundle-repository.js";
import { loadControlPlaneConfig } from "../src/core/control-plane-config.js";
import { getControlPlanePool } from "../src/core/control-plane-db.js";
import { runControlPlaneMigrations } from "../src/core/control-plane-migrations.js";
import { logger } from "../src/core/logger.js";

async function main() {
  const config = loadControlPlaneConfig();
  const db = getControlPlanePool(config);
  await runControlPlaneMigrations(db);

  const repository = new ChannelBundleRepository(db);
  const channelId = process.env.BOOTSTRAP_CHANNEL_ID?.trim() || "canal-demo";
  const existing = await repository.getBundle(channelId);
  if (existing) {
    logger.info({ channelId }, "Bootstrap skipped; channel already exists");
    return;
  }

  const now = new Date().toISOString();
  await repository.saveBundle({
    channel: {
      id: channelId,
      slug: process.env.BOOTSTRAP_CHANNEL_SLUG?.trim() || "canal-demo",
      name: process.env.BOOTSTRAP_CHANNEL_NAME?.trim() || "Canal Demo",
      description: "Canal inicial para desenvolvimento local do control plane.",
      status: "active",
      logoPath: null,
      watermarkText: "Canal Demo",
      createdAt: now,
      updatedAt: now,
    },
    profile: {
      channelId,
      videoLimit: 3,
      minShortDuration: 15,
      maxShortDuration: 59,
      targetShorts: 3,
      videoQuery: null,
      sortByViews: false,
      aiProvider: "ollama",
      aiModel: process.env.AI_MODEL?.trim() || "gemma3:1b",
    },
    focuses: [{ id: randomUUID(), key: "catolicos", label: "Católicos" }],
    sources: [{ id: randomUUID(), kind: "youtube_channel", value: "UC_x5XG1OV2P6uZZ5FSM9Ttw", label: "Canal de exemplo", createdAt: now }],
    publishingAccounts: [],
  });

  logger.info({ channelId }, "Bootstrap complete");
}

void main();