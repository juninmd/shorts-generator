import { loadConfig } from "../core/config.js";
import { tryLoadControlPlaneConfig } from "../core/control-plane-config.js";
import { getControlPlanePool } from "../core/control-plane-db.js";
import { ChannelBundleRepository } from "../core/channel-bundle-repository.js";
import { collectChannelSnapshots } from "../core/feedback/snapshot-collector.js";
import { sendDailyDashboardDigest } from "../core/feedback/dashboard-notify.js";
import { logger } from "../core/logger.js";

/**
 * Standalone entry point (no BullMQ worker required) for the daily metrics
 * digest: collect one snapshot per published clip, then send the dashboard
 * link to Telegram at most once per UTC day. Meant to run on a schedule
 * (cron / k8s CronJob) independent from the upload/generation pipeline.
 */
export async function runMetricsDigestCommand(): Promise<void> {
  const controlPlaneConfig = tryLoadControlPlaneConfig();
  if (!controlPlaneConfig) {
    logger.warn("generate:metrics-digest: control-plane não configurado (DATABASE_URL/ADMIN_API_TOKEN ausentes); nada a fazer.");
    return;
  }

  const db = getControlPlanePool(controlPlaneConfig);
  const config = loadConfig();
  const bundles = await new ChannelBundleRepository(db).listBundles();
  const activeChannels = bundles.filter((b) => b.channel.status === "active");

  for (const bundle of activeChannels) {
    const report = await collectChannelSnapshots(db, bundle.channel.id, config);
    logger.info(report, "generate:metrics-digest: snapshots coletados");
  }

  const result = await sendDailyDashboardDigest(db, config);
  logger.info({ result, channels: activeChannels.length }, "generate:metrics-digest: digest diário processado");
}
