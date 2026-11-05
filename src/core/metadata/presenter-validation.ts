import { normalizeText, words } from "../text-normalize.js";

const PLACEHOLDER_NAMES = new Set([
  "presenter", "apresentador", "apresentadora", "unknown", "desconhecido", "desconhecida",
  "null", "undefined", "none", "n a", "na", "nao informado", "nao identificado", "speaker",
  "orador", "palestrante", "entrevistado", "entrevistador", "host", "narrador", "nome",
  "nome do apresentador", "sem nome", "anonimo", "vazio", "empty", "tbd", "xxx",
]);

// Honorifics do not identify anybody on their own.
const HONORIFICS = new Set(["padre", "pe", "frei", "dom", "irma", "irmao", "dr", "dra", "prof", "professor", "professora", "pastor", "santo", "santa", "sao", "monsenhor", "diacono", "de", "da", "do", "dos", "das"]);

export function isPlaceholderName(name: string | null | undefined): boolean {
  const normalized = normalizeText(name ?? "");
  if (!normalized) return true;
  if (PLACEHOLDER_NAMES.has(normalized)) return true;
  if (/[{}[\]<>]/.test(name ?? "")) return true;
  return words(normalized).every((w) => HONORIFICS.has(w) || PLACEHOLDER_NAMES.has(w));
}

/** Every identifying token of the name must appear in the evidence (transcript, source title, channel). */
export function hasPresenterEvidence(name: string, evidence: string): boolean {
  const haystack = ` ${normalizeText(evidence)} `;
  const identifying = words(name).filter((w) => w.length >= 3 && !HONORIFICS.has(w));
  return identifying.length > 0 && identifying.every((w) => haystack.includes(` ${w} `));
}

/** Returns a publishable presenter name or null (placeholder or unsupported by evidence). */
export function sanitizePresenter(name: string | null | undefined, evidence: string): string | null {
  const trimmed = (name ?? "").trim().replace(/\s+/g, " ");
  if (isPlaceholderName(trimmed)) return null;
  return hasPresenterEvidence(trimmed, evidence) ? trimmed : null;
}
