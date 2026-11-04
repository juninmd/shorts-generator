import type { HeatSegment } from "../types.js";

const MAX_BONUS = 0.5;
const HOT_RATIO = 1.3;

/** yt-dlp `heatmap` ("Mais reassistidos") → validated segments; anything malformed is dropped. */
export function parseHeatmap(raw: unknown): HeatSegment[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const segments = raw.flatMap((item): HeatSegment[] => {
    const { start_time: start, end_time: end, value } = (item ?? {}) as Record<string, unknown>;
    return typeof start === "number" && typeof end === "number" && typeof value === "number" && end > start
      ? [{ start, end, value }]
      : [];
  });
  return segments.length > 0 ? segments : undefined;
}

/** Mean replay intensity over [start, end], weighted by how much of each segment falls inside. */
export function meanHeat(start: number, end: number, heatmap: HeatSegment[]): number {
  let weighted = 0;
  let covered = 0;
  for (const segment of heatmap) {
    const overlap = Math.min(end, segment.end) - Math.max(start, segment.start);
    if (overlap <= 0) continue;
    weighted += overlap * segment.value;
    covered += overlap;
  }
  return covered > 0 ? weighted / covered : 0;
}

const average = (heatmap: HeatSegment[]): number =>
  heatmap.reduce((sum, segment) => sum + segment.value, 0) / heatmap.length;

/** 0..MAX_BONUS: how much more re-watched a span is than the video's average (audience proof). */
export function replayBonus(start: number, end: number, heatmap?: HeatSegment[]): number {
  if (!heatmap || heatmap.length === 0) return 0;
  const base = average(heatmap);
  if (base <= 0) return 0;
  const lift = meanHeat(start, end, heatmap) / base - 1;
  return Math.max(0, Math.min(MAX_BONUS, lift * MAX_BONUS));
}

const clock = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

/** Prompt block naming the most re-watched stretches (merged adjacent hot segments). */
export function buildReplayHint(heatmap: HeatSegment[] | undefined, count = 3): string {
  if (!heatmap || heatmap.length === 0) return "";
  const hot = heatmap.filter((segment) => segment.value >= HOT_RATIO * average(heatmap));
  const spans: Array<HeatSegment> = [];
  for (const segment of [...hot].sort((a, b) => a.start - b.start)) {
    const last = spans[spans.length - 1];
    if (last && segment.start <= last.end + 0.5) {
      last.end = segment.end;
      last.value = Math.max(last.value, segment.value);
    } else spans.push({ ...segment });
  }
  const picked = spans.sort((a, b) => b.value - a.value).slice(0, count).sort((a, b) => a.start - b.start);
  if (picked.length === 0) return "";
  const list = picked.map((span) => `${clock(span.start)}-${clock(span.end)}`).join(", ");
  return `MAIS REASSISTIDOS: o público do YouTube volta para rever ${list}. É prova real de interesse; priorize cortes que contenham esses trechos.\n`;
}
