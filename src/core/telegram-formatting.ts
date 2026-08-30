
import type { GeneratedShort, PipelineConfig } from "../types.js";

export function escapeHtml(text: string): string {
  if (!text) return "";
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
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
