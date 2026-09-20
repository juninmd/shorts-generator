import type { PipelineConfig } from "../../types.js";
import type { SqlClient } from "../control-plane-db.js";
import { logger } from "../logger.js";
import { analyticsSource, publicSource, type MetricsResult, type MetricsSource } from "./metrics-sources.js";
import { SnapshotRepository } from "./snapshot-repository.js";

export interface CollectionReport {
  readonly channelId: string;
  readonly candidates: number;
  readonly collected: number;
  readonly source: "analytics" | "public" | "none";
  readonly analyticsStatus: MetricsResult["status"] | "skipped";
  readonly publicStatus: MetricsResult["status"] | "skipped";
}

export interface CollectorDeps {
  readonly analytics?: MetricsSource;
  readonly publicStats?: MetricsSource;
  readonly now?: Date;
}

// Analytics answers are cached per channel to protect the daily quota.
const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, { at: number; result: MetricsResult }>();
export const clearMetricsCache = () => cache.clear();

async function cachedAnalytics(channelId: string, ids: readonly string[], config: PipelineConfig, source: MetricsSource, now: number): Promise<MetricsResult> {
  const key = `${channelId}:${[...ids].sort().join(",")}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.result;
  const result = await source(ids, config);
  // Permission/quota failures are cached too, so a missing scope is not retried every run.
  cache.set(key, { at: now, result });
  return result;
}

/** Records one snapshot per published video; Analytics first, public counts as limited fallback. */
export async function collectChannelSnapshots(db: SqlClient, channelId: string, config: PipelineConfig, deps: CollectorDeps = {}): Promise<CollectionReport> {
  const now = deps.now ?? new Date();
  const repo = new SnapshotRepository(db);
  const videos = await repo.publishedForCollection(channelId, now);
  const ids = videos.map((v) => v.youtubeVideoId);
  const base = { channelId, candidates: videos.length };
  if (videos.length === 0) return { ...base, collected: 0, source: "none", analyticsStatus: "skipped", publicStatus: "skipped" };

  const analytics = await cachedAnalytics(channelId, ids, config, deps.analytics ?? analyticsSource, now.getTime());
  let metrics = analytics.status === "ok" ? analytics.metrics : null;
  let publicStatus: CollectionReport["publicStatus"] = "skipped";
  if (!metrics || metrics.size === 0) {
    logger.warn({ channelId, analytics: analytics.status }, "YouTube Analytics indisponível; usando métricas públicas limitadas");
    const pub = await (deps.publicStats ?? publicSource)(ids, config);
    publicStatus = pub.status;
    metrics = pub.status === "ok" ? pub.metrics : null;
  }
  if (!metrics) return { ...base, collected: 0, source: "none", analyticsStatus: analytics.status, publicStatus };

  let collected = 0;
  for (const video of videos) {
    const snapshot = metrics.get(video.youtubeVideoId);
    if (!snapshot) continue;
    await repo.insert(channelId, video, now, snapshot);
    collected++;
  }
  const source = analytics.status === "ok" && analytics.metrics.size > 0 ? "analytics" : "public";
  logger.info({ channelId, collected, source }, "Snapshots de métricas coletados");
  return { ...base, collected, source, analyticsStatus: analytics.status, publicStatus };
}
