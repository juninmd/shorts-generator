import type { SqlClient } from "../control-plane-db.js";
import { ChannelBundleRepository } from "../channel-bundle-repository.js";
import { byFormatAndTheme, classifyWindow, type FeedbackWindow, type WindowGroup } from "./window-classifier.js";
import { SnapshotRepository, type DailyMetricPoint } from "./snapshot-repository.js";

export interface ChannelDashboard {
  readonly channelId: string;
  readonly channelName: string;
  readonly channelType: string;
  readonly status: string;
  readonly series: readonly DailyMetricPoint[];
  readonly windows: readonly WindowGroup[];
}

export interface DashboardData {
  readonly generatedAt: string;
  readonly channels: readonly ChannelDashboard[];
}

const WINDOWS: readonly FeedbackWindow[] = ["24h", "72h", "7d"];

/** Evolução de métricas por canal: série diária + classificação por janela comparável. */
export async function buildDashboardData(db: SqlClient, now = new Date()): Promise<DashboardData> {
  const bundles = await new ChannelBundleRepository(db).listBundles();
  const snapshots = new SnapshotRepository(db);
  const channels: ChannelDashboard[] = [];

  for (const bundle of bundles) {
    if (bundle.channel.status !== "active") continue;
    const [series, recent] = await Promise.all([
      snapshots.dailySeries(bundle.channel.id, now),
      snapshots.recent(bundle.channel.id, now),
    ]);
    const windows = WINDOWS.flatMap((w) => classifyWindow(recent, w, byFormatAndTheme).filter((g) => g.status === "ok"));
    channels.push({
      channelId: bundle.channel.id,
      channelName: bundle.channel.name,
      channelType: bundle.channel.channelType,
      status: bundle.channel.status,
      series,
      windows,
    });
  }

  return { generatedAt: now.toISOString(), channels };
}

/** Short pt-BR summary used in the daily Telegram digest. */
export function summarizeDashboard(data: DashboardData): string {
  if (data.channels.length === 0) return "Nenhum canal ativo com métricas ainda.";
  return data.channels
    .map((c) => {
      const last = c.series.at(-1);
      const views = last ? last.totalViews.toLocaleString("pt-BR") : "0";
      return `• <b>${c.channelName}</b>: ${views} views (último dia com dados)`;
    })
    .join("\n");
}
