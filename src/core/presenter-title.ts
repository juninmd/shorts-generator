/**
 * Build a presenter-aware title. When a presenter name is identified and is not
 * already part of the title, prefix it so the speaker becomes the highlight
 * (e.g. "Padre Paulo Ricardo: O segredo da oração"). Falls back to the raw
 * title when no presenter is known or it is already mentioned.
 */
export function buildPresenterTitle(title: string, presenter?: string | null): string {
  const name = (presenter ?? "").trim();
  const base = (title ?? "").trim();
  if (!name) return base;
  const escapedName = name.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
  const regex = new RegExp("(?<![\\p{L}\\p{N}])" + escapedName + "(?![\\p{L}\\p{N}])", "ui");
  if (regex.test(base)) return base;
  return name + ": " + base;
}
