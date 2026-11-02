import type { Transcript } from "../types.js";
import type { ClipItem } from "./analyzer-schema.js";

const SPONSOR_PATTERNS = [
  /\bpublicidade\b/, /\bpatrocin/, /\bcupom\b/, /\bcodigo de desconto\b/,
  /\b(use|usando|com) o codigo\b/, /\blink na descricao\b/, /\bafiliad/,
  /\bparceria (paga|com a marca)\b/, /\bsponsor/, /\bpromo code\b/, /\baffiliate\b/,
];

const normalize = (text: string): string =>
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Two or more distinct sponsor cues (coupon + link, sponsor + code...) mark an ad read. */
export function looksSponsored(text: string): boolean {
  const normalized = normalize(text);
  return SPONSOR_PATTERNS.filter((pattern) => pattern.test(normalized)).length >= 2;
}

export function dropSponsoredClips(clips: ClipItem[], transcript: Transcript): ClipItem[] {
  return clips.filter((clip) => !looksSponsored(
    transcript.segments
      .filter((segment) => segment.end > clip.startTime && segment.start < clip.endTime)
      .map((segment) => segment.text)
      .join(" "),
  ));
}
