
import type { GeneratedShort, PipelineConfig } from "../types.js";

export function escapeHtml(text: string): string {
  if (!text) return "";
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * Escapes `text` for Telegram HTML within `maxLength` escaped characters,
 * cut on a whole character (never inside an entity or an emoji) with "…".
 */
export function escapeHtmlWithin(text: string, maxLength: number): string {
  const full = escapeHtml(text);
  if (full.length <= maxLength) return full;
  let out = "";
  for (const char of text) {
    const piece = escapeHtml(char);
    if (out.length + piece.length + 1 > maxLength) break;
    out += piece;
  }
  return maxLength > 0 ? `${out.trimEnd()}…` : "";
}

/**
 * Build a short, human-friendly preview of the tags applied to a YouTube upload.
 * Caps the number shown so the Telegram message stays readable, and signals how
 * many extra tags were sent beyond the preview.
 */
export function formatTagsPreview(tags: string[] | undefined, maxShown = 12): string {
  const clean = (tags || []).map((t) => (t ?? "").trim()).filter(Boolean);
  if (clean.length === 0) return "";
  const shown = clean.slice(0, maxShown);
  const rest = clean.length - shown.length;
  const list = shown.map((t) => escapeHtml(t)).join(", ");
  return rest > 0 ? `${list} <i>(+${rest})</i>` : list;
}

/** "Gancho 9 · Fluxo 8 · Engajamento 8 · Tendência 7" */
export function formatScoreBreakdown(score: { hook: number; flow: number; engagement: number; trend: number }): string {
  return `Gancho ${score.hook} · Fluxo ${score.flow} · Engajamento ${score.engagement} · Tendência ${score.trend}`;
}
