import type { PipelineConfig } from "../types.js";
import { getOptionalPool, type SqlClient } from "./control-plane-db.js";
import { logger } from "./logger.js";
import { SnapshotRepository } from "./feedback/snapshot-repository.js";
import { byFormat, classifyWindow, type FeedbackWindow, type WindowGroup } from "./feedback/window-classifier.js";

export interface ChannelFeedback {
  topTitles: string[];
  flopTitles: string[];
  medianViews: number;
  window: FeedbackWindow;
  sampleSize: number;
}

/** Resolve the destination channel handle: explicit env config wins, then the
 *  managed channel id when it looks like a YouTube handle slug. */
export function resolveChannelHandle(config: PipelineConfig): string | null {
  if (config.channelHandle) {
    return config.channelHandle.startsWith("@") ? config.channelHandle : `@${config.channelHandle}`;
  }
  const id = config.managedRun?.channelId;
  if (id && /^[a-z0-9._-]{3,30}$/i.test(id)) return `@${id}`;
  return null;
}

// Prefer the 72h comparison (enough signal, still recent); 24h only when 72h lacks samples.
const WINDOW_PREFERENCE: FeedbackWindow[] = ["72h", "24h", "7d"];

export function pickFeedbackGroup(groups: WindowGroup[][]): WindowGroup | null {
  for (const windowGroups of groups) {
    const ok = windowGroups.find((g) => g.status === "ok");
    if (ok) return ok;
  }
  return null;
}

/**
 * Feedback from age-comparable snapshots of this channel's own publications.
 * Returns null (comparative classification suspended) without DB or enough mature samples.
 */
export async function getChannelFeedback(config: PipelineConfig, db: SqlClient | null = getOptionalPool(), now = new Date()): Promise<ChannelFeedback | null> {
  const channelId = config.managedRun?.channelId;
  if (!db || !channelId) return null;
  try {
    const snapshots = await new SnapshotRepository(db).recent(channelId, now);
    const format = config.managedRun?.channelType ?? "cuts";
    const own = snapshots.filter((s) => s.format === format);
    const group = pickFeedbackGroup(WINDOW_PREFERENCE.map((w) => classifyWindow(own, w, byFormat)));
    if (!group || group.medianViews === null) return null;
    const pct = (v: number | null) => (v === null ? "" : `, ${v.toFixed(0)}% assistido`);
    return {
      topTitles: group.top.map((v) => `${v.title} (${v.views} views em ${group.window}${pct(v.avgViewPercentage)})`),
      flopTitles: group.flop.map((v) => v.title),
      medianViews: group.medianViews,
      window: group.window,
      sampleSize: group.sampleSize,
    };
  } catch (error) {
    logger.warn({ channelId, error: error instanceof Error ? error.message : String(error) }, "viral-feedback: snapshots indisponíveis");
    return null;
  }
}

/** Render the feedback as a prompt block, or empty string when unavailable. */
export function formatFeedbackForPrompt(feedback: ChannelFeedback | null): string {
  if (!feedback || feedback.topTitles.length === 0) return "";
  return `
DADOS REAIS DO CANAL DE DESTINO (vídeos comparados na mesma idade: ${feedback.window}, amostra ${feedback.sampleSize}):
Títulos que MAIS performaram — siga este estilo:
${feedback.topTitles.map((t) => `- ${t}`).join("\n")}
Títulos com MENOR desempenho na mesma janela — evite este estilo:
${feedback.flopTitles.map((t) => `- ${t}`).join("\n")}
`;
}
