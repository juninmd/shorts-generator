import { randomUUID } from "node:crypto";
import { queryRows, type SqlClient } from "../control-plane-db.js";
import type { MetricSnapshot } from "./window-classifier.js";

export interface PublishedVideo {
  readonly publicationId: string;
  readonly youtubeVideoId: string;
  readonly title: string;
  readonly format: string;
  readonly theme: string | null;
  readonly publishedAt: string;
}

export interface SnapshotInput {
  readonly views: number;
  readonly likes?: number | null;
  readonly comments?: number | null;
  readonly avgViewDurationSec?: number | null;
  readonly avgViewPercentage?: number | null;
  readonly subscribersGained?: number | null;
  readonly source: "analytics" | "public";
}

export class SnapshotRepository {
  constructor(private readonly db: SqlClient) {}

  /** Published videos still inside the longest window (+1 day), bounded. */
  async publishedForCollection(channelId: string, now: Date, maxAgeDays = 8, limit = 100): Promise<PublishedVideo[]> {
    const since = new Date(now.getTime() - maxAgeDays * 86_400_000).toISOString();
    const rows = await queryRows<Record<string, any>>(this.db,
      `SELECT id, youtube_video_id, title, format, theme, published_at FROM clip_publications
       WHERE channel_id = $1 AND status = 'published' AND youtube_video_id IS NOT NULL AND published_at >= $2
       ORDER BY published_at DESC LIMIT ${Math.min(limit, 500)}`, [channelId, since]);
    return rows.map((r) => ({ publicationId: r.id, youtubeVideoId: r.youtube_video_id, title: r.title, format: r.format, theme: r.theme ?? null, publishedAt: String(r.published_at) }));
  }

  async insert(channelId: string, video: PublishedVideo, capturedAt: Date, s: SnapshotInput): Promise<void> {
    const ageHours = (capturedAt.getTime() - new Date(video.publishedAt).getTime()) / 3_600_000;
    await this.db.query(
      `INSERT INTO video_metric_snapshots (id, channel_id, youtube_video_id, publication_id, title, format, theme, published_at, captured_at,
         age_hours, views, likes, comments, avg_view_duration_sec, avg_view_percentage, subscribers_gained, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [randomUUID(), channelId, video.youtubeVideoId, video.publicationId, video.title, video.format, video.theme, video.publishedAt,
        capturedAt.toISOString(), ageHours, s.views, s.likes ?? null, s.comments ?? null, s.avgViewDurationSec ?? null,
        s.avgViewPercentage ?? null, s.subscribersGained ?? null, s.source],
    );
  }

  async recent(channelId: string, now: Date, days = 60, limit = 5000): Promise<MetricSnapshot[]> {
    const since = new Date(now.getTime() - days * 86_400_000).toISOString();
    const rows = await queryRows<Record<string, any>>(this.db,
      `SELECT youtube_video_id, title, format, theme, age_hours, views, avg_view_percentage, subscribers_gained
       FROM video_metric_snapshots WHERE channel_id = $1 AND published_at >= $2 ORDER BY captured_at DESC LIMIT ${limit}`,
      [channelId, since]);
    return rows.map((r) => ({
      youtubeVideoId: r.youtube_video_id, title: r.title, format: r.format, theme: r.theme ?? null,
      ageHours: Number(r.age_hours), views: Number(r.views),
      avgViewPercentage: r.avg_view_percentage == null ? null : Number(r.avg_view_percentage),
      subscribersGained: r.subscribers_gained == null ? null : Number(r.subscribers_gained),
    }));
  }

  /** One point per calendar day: the latest snapshot per video that day, summed/averaged across videos. */
  async dailySeries(channelId: string, now: Date, days = 14): Promise<DailyMetricPoint[]> {
    const since = new Date(now.getTime() - days * 86_400_000).toISOString();
    // Window function (not DISTINCT ON / :: casts) so the query also runs on the SQLite test backend.
    const rows = await queryRows<Record<string, any>>(this.db,
      `SELECT day, SUM(views) AS total_views, AVG(avg_view_percentage) AS avg_pct, COUNT(DISTINCT youtube_video_id) AS videos
       FROM (
         SELECT substr(captured_at, 1, 10) AS day, youtube_video_id, views, avg_view_percentage,
           ROW_NUMBER() OVER (PARTITION BY youtube_video_id, substr(captured_at, 1, 10) ORDER BY captured_at DESC) AS rn
         FROM video_metric_snapshots
         WHERE channel_id = $1 AND captured_at >= $2
       ) latest_per_day
       WHERE rn = 1
       GROUP BY day ORDER BY day ASC`,
      [channelId, since]);
    return rows.map((r) => ({
      day: String(r.day), totalViews: Number(r.total_views ?? 0),
      avgViewPercentage: r.avg_pct == null ? null : Number(r.avg_pct), videoCount: Number(r.videos ?? 0),
    }));
  }
}

export interface DailyMetricPoint {
  readonly day: string;
  readonly totalViews: number;
  readonly avgViewPercentage: number | null;
  readonly videoCount: number;
}
