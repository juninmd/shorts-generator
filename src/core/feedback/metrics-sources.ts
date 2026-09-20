import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { google } from "googleapis";
import type { PipelineConfig } from "../../types.js";
import { getYouTubeAuth } from "../youtube-auth.service.js";
import type { SnapshotInput } from "./snapshot-repository.js";

const execFileAsync = promisify(execFile);

export type MetricsResult =
  | { readonly status: "ok"; readonly metrics: Map<string, SnapshotInput> }
  | { readonly status: "no_permission" | "quota" | "error" | "unavailable"; readonly error: string };

export type MetricsSource = (videoIds: readonly string[], config: PipelineConfig) => Promise<MetricsResult>;

export function classifyMetricsError(error: unknown): MetricsResult {
  const e = error as { code?: unknown; response?: { status?: number }; message?: string };
  const status = Number(e?.response?.status ?? e?.code);
  const message = String(e?.message ?? error);
  if (status === 403 && /insufficient|permission|scope|forbidden/i.test(message)) return { status: "no_permission", error: message };
  if (status === 429 || /quota/i.test(message)) return { status: "quota", error: message };
  if (status === 401 || /invalid_grant|insufficient.*scope/i.test(message)) return { status: "no_permission", error: message };
  return { status: "error", error: message };
}

const today = (d: Date) => d.toISOString().slice(0, 10);

/**
 * YouTube Analytics API v2 (requires yt-analytics.readonly scope).
 * https://developers.google.com/youtube/analytics/metrics
 */
export const analyticsSource: MetricsSource = async (videoIds, config) => {
  if (videoIds.length === 0) return { status: "ok", metrics: new Map() };
  const auth = await getYouTubeAuth(config);
  if (!auth) return { status: "unavailable", error: "YouTube credentials not configured" };
  try {
    const client = new google.auth.OAuth2(auth.clientId, auth.clientSecret);
    client.setCredentials({ refresh_token: auth.refreshToken });
    const now = new Date();
    const res = await google.youtubeAnalytics({ version: "v2", auth: client }).reports.query({
      ids: "channel==MINE",
      startDate: today(new Date(now.getTime() - 30 * 86_400_000)),
      endDate: today(now),
      metrics: "views,likes,comments,averageViewDuration,averageViewPercentage,subscribersGained",
      dimensions: "video",
      filters: `video==${videoIds.slice(0, 200).join(",")}`,
    });
    const metrics = new Map<string, SnapshotInput>();
    for (const row of res.data.rows ?? []) {
      const [id, views, likes, comments, avgDuration, avgPct, subs] = row as [string, number, number, number, number, number, number];
      metrics.set(id, { views, likes, comments, avgViewDurationSec: avgDuration, avgViewPercentage: avgPct, subscribersGained: subs, source: "analytics" });
    }
    return { status: "ok", metrics };
  } catch (error) {
    return classifyMetricsError(error);
  }
};

/** Public fallback: view/like/comment counts via yt-dlp; ages come from our own publish records. */
export const publicSource: MetricsSource = async (videoIds) => {
  if (videoIds.length === 0) return { status: "ok", metrics: new Map() };
  try {
    const { stdout } = await execFileAsync("yt-dlp", [
      "--skip-download", "--no-warnings", "--ignore-errors",
      "--print", "%(id)s|%(view_count)s|%(like_count)s|%(comment_count)s",
      ...videoIds.slice(0, 50).map((id) => `https://www.youtube.com/shorts/${id}`),
    ], { timeout: 120_000, maxBuffer: 4 * 1024 * 1024 });
    const metrics = new Map<string, SnapshotInput>();
    for (const line of stdout.split("\n")) {
      const [id, views, likes, comments] = line.trim().split("|");
      const n = (v?: string) => (v && /^\d+$/.test(v) ? Number(v) : null);
      if (id && n(views) !== null) metrics.set(id, { views: n(views)!, likes: n(likes), comments: n(comments), source: "public" });
    }
    return { status: "ok", metrics };
  } catch (error) {
    return { status: "error", error: error instanceof Error ? error.message : String(error) };
  }
};
