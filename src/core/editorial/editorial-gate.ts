import { containsPhrase, normalizeText } from "../text-normalize.js";
import type { ContentFormat, EditorialProfile } from "./editorial-profile.js";

export interface EditorialVerdict {
  readonly ok: boolean;
  readonly reasons: string[];
}

/** Hard exclusion: any excluded theme mentioned as whole words blocks the content. */
export function findExcludedThemes(text: string, profile: EditorialProfile): string[] {
  return profile.excludedThemes.filter((theme) => containsPhrase(text, theme));
}

/** Loose allow-list match: any significant word (>=4 chars) of an allowed theme as a word prefix. */
export function matchesAllowedTheme(text: string, profile: EditorialProfile): boolean {
  if (profile.allowedThemes.length === 0) return true;
  const haystack = ` ${normalizeText(text)} `;
  return profile.allowedThemes.some((theme) =>
    normalizeText(theme).split(" ").filter((w) => w.length >= 4).some((w) => haystack.includes(` ${w}`)));
}

export function checkFormatAllowed(format: ContentFormat, profile: EditorialProfile): EditorialVerdict {
  return profile.allowedFormats.includes(format)
    ? { ok: true, reasons: [] }
    : { ok: false, reasons: [`formato ${format} não permitido pelo perfil editorial`] };
}

/**
 * Adherence check before rendering. `themeAllowed` is the reviewer's judgement
 * (undefined when unavailable); keyword exclusion always wins.
 */
export function checkEditorialAdherence(
  text: string,
  profile: EditorialProfile,
  themeAllowed?: boolean,
): EditorialVerdict {
  const reasons: string[] = [];
  const excluded = findExcludedThemes(text, profile);
  if (excluded.length) reasons.push(`tema excluído: ${excluded.join(", ")}`);
  if (themeAllowed === false) reasons.push("revisor indicou tema fora do perfil");
  else if (themeAllowed === undefined && !matchesAllowedTheme(text, profile)) {
    reasons.push("nenhum tema permitido identificado");
  }
  return { ok: reasons.length === 0, reasons };
}
