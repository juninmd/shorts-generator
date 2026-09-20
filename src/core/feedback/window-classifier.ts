export const FEEDBACK_WINDOWS = { "24h": 24, "72h": 72, "7d": 168 } as const;
export type FeedbackWindow = keyof typeof FEEDBACK_WINDOWS;
export const MIN_SAMPLE = 8;
// A snapshot represents window W when taken between W and W * 1.25 hours after publishing.
const WINDOW_TOLERANCE = 1.25;

export interface MetricSnapshot {
  readonly youtubeVideoId: string;
  readonly title: string;
  readonly format: string;
  readonly theme: string | null;
  readonly ageHours: number;
  readonly views: number;
  readonly avgViewPercentage?: number | null;
  readonly subscribersGained?: number | null;
}

export interface RankedVideo {
  readonly youtubeVideoId: string;
  readonly title: string;
  readonly views: number;
  readonly avgViewPercentage: number | null;
}

export interface WindowGroup {
  readonly key: string;
  readonly window: FeedbackWindow;
  readonly sampleSize: number;
  readonly immature: number;
  readonly status: "ok" | "insufficient_sample";
  readonly medianViews: number | null;
  readonly top: RankedVideo[];
  readonly flop: RankedVideo[];
}

function quantile(sorted: number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))]!;
}

/** Latest snapshot per video, keeping the maximum observed age (tells if the video is mature). */
function snapshotAt(snapshots: readonly MetricSnapshot[], hours: number) {
  const byVideo = new Map<string, { at?: MetricSnapshot; maxAge: number; ref: MetricSnapshot }>();
  for (const s of snapshots) {
    const entry = byVideo.get(s.youtubeVideoId) ?? { maxAge: 0, ref: s };
    entry.maxAge = Math.max(entry.maxAge, s.ageHours);
    const inWindow = s.ageHours >= hours && s.ageHours <= hours * WINDOW_TOLERANCE;
    if (inWindow && (!entry.at || s.ageHours < entry.at.ageHours)) entry.at = s;
    byVideo.set(s.youtubeVideoId, entry);
  }
  return [...byVideo.values()];
}

/**
 * Compares videos only at the same age. Videos younger than the window are
 * "immature" and never become negative examples; small groups are not ranked.
 */
export function classifyWindow(snapshots: readonly MetricSnapshot[], window: FeedbackWindow, groupKey: (s: MetricSnapshot) => string): WindowGroup[] {
  const hours = FEEDBACK_WINDOWS[window];
  const groups = new Map<string, { mature: MetricSnapshot[]; immature: number }>();
  for (const entry of snapshotAt(snapshots, hours)) {
    const key = groupKey(entry.ref);
    const group = groups.get(key) ?? { mature: [], immature: 0 };
    if (entry.at) group.mature.push(entry.at);
    else if (entry.maxAge < hours) group.immature++;
    groups.set(key, group);
  }
  return [...groups.entries()].map(([key, { mature, immature }]) => {
    const views = mature.map((s) => s.views).sort((a, b) => a - b);
    const rank = (s: MetricSnapshot): RankedVideo => ({ youtubeVideoId: s.youtubeVideoId, title: s.title, views: s.views, avgViewPercentage: s.avgViewPercentage ?? null });
    if (mature.length < MIN_SAMPLE) {
      return { key, window, sampleSize: mature.length, immature, status: "insufficient_sample" as const, medianViews: null, top: [], flop: [] };
    }
    const p75 = quantile(views, 0.75);
    const p25 = quantile(views, 0.25);
    const byViews = [...mature].sort((a, b) => b.views - a.views);
    return {
      key, window, sampleSize: mature.length, immature, status: "ok" as const,
      medianViews: quantile(views, 0.5),
      top: byViews.filter((s) => s.views >= p75).slice(0, 8).map(rank),
      flop: byViews.filter((s) => s.views <= p25).slice(-8).map(rank),
    };
  });
}

export const byFormatAndTheme = (s: MetricSnapshot) => `${s.format}|${s.theme ?? "geral"}`;
export const byFormat = (s: MetricSnapshot) => `${s.format}|*`;
