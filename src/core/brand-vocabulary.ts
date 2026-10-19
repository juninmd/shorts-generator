import fs from "node:fs";
import type { Transcript } from "../types.js";

const fold = (text: string): string =>
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Brand terms (names, products, jargon) from BRAND_VOCABULARY (comma separated) and BRAND_VOCABULARY_FILE (one per line). */
export function loadBrandVocabulary(): string[] {
  const inline = (process.env.BRAND_VOCABULARY ?? "").split(",");
  const file = process.env.BRAND_VOCABULARY_FILE;
  const fromFile = file && fs.existsSync(file) ? fs.readFileSync(file, "utf-8").split(/\r?\n/) : [];
  return [...new Set([...inline, ...fromFile].map((term) => term.trim()).filter((term) => /^\S+$/.test(term)))];
}

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(previous[j]! + 1, row[j - 1]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = row;
  }
  return previous[b.length]!;
}

/** Corrects one token to the closest brand term (same first letter, small edit distance), keeping punctuation. */
export function correctToken(token: string, terms: string[]): string {
  const [, lead, core, tail] = token.match(/^([^\p{L}\p{N}]*)([\s\S]*?)([^\p{L}\p{N}]*)$/u)!;
  const key = fold(core);
  if (key.length < 3) return token;
  for (const term of terms) {
    const termKey = fold(term);
    const tolerance = Math.max(1, Math.floor(termKey.length / 5));
    if (termKey[0] === key[0] && editDistance(key, termKey) <= tolerance) return `${lead}${term}${tail}`;
  }
  return token;
}

/** Applies the brand vocabulary to words, segments and full text so every later stage sees consistent spelling. */
export function applyBrandVocabulary(transcript: Transcript, terms: string[]): Transcript {
  if (terms.length === 0) return transcript;
  const fix = (text: string): string => text.split(/(\s+)/).map((part) => correctToken(part, terms)).join("");
  return {
    ...transcript,
    words: transcript.words.map((word) => ({ ...word, word: correctToken(word.word, terms) })),
    segments: transcript.segments.map((segment) => ({ ...segment, text: fix(segment.text) })),
    fullText: fix(transcript.fullText),
  };
}
