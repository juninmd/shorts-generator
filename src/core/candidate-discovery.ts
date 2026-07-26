import type { Transcript, TranscriptSegment } from "../types.js";
import type { ClipItem } from "./analyzer-schema.js";

const IMPACT_PATTERNS = [
  /\bverdade\b/, /\blibert/, /\bsalv/, /\bcur/, /\bn[aã]o posso\b/,
  /\bser[aá] que\b/, /\bego\b/, /\bporta estreita\b/, /\bcruz\b/,
  /\bmedo\b/, /\b[oó]di/, /\bperseg/, /\bnunca\b/, /\bsegredo\b/,
];
const WEAK_STARTS = [
  /\bol[aá]\b/, /\bhoje eu (quero|vou) falar\b/, /\bessa palavra [eé] importante\b/,
  /\bem nome do pai\b/, /\bescreva .*coment[aá]rio/, /\bcompartilh/, /\binscrev/,
];

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function scoreTextualImpact(text: string): number {
  const normalized = normalize(text);
  const impact = IMPACT_PATTERNS.reduce(
    (score, pattern) => score + (pattern.test(normalized) ? 2 : 0),
    0,
  );
  const rhetoric = (text.includes("?") ? 2 : 0) + (text.includes("!") ? 1 : 0);
  const penalty = WEAK_STARTS.some((pattern) => pattern.test(normalized)) ? 6 : 0;
  return impact + rhetoric - penalty;
}

function findWindowEnd(
  segments: TranscriptSegment[],
  startIndex: number,
  minDuration: number,
  maxDuration: number,
): number | null {
  const start = segments[startIndex]!.start;
  let fallback: number | null = null;
  for (let index = startIndex; index < segments.length; index++) {
    const segment = segments[index]!;
    const duration = segment.end - start;
    if (duration > maxDuration) break;
    if (duration < minDuration) continue;
    fallback = segment.end;
    if (/[.!?]["']?$/.test(segment.text.trim())) return segment.end;
  }
  return fallback;
}

function titleFromHook(hook: string): string {
  const cleaned = hook.replace(/\s+/g, " ").replace(/[.!?]+$/g, "").trim();
  return cleaned.length <= 60 ? cleaned : `${cleaned.slice(0, 57).trimEnd()}...`;
}

function buildCandidate(
  transcript: Transcript,
  startIndex: number,
  endTime: number,
  score: number,
): ClipItem {
  const selected = transcript.segments.filter(
    (segment) => segment.start >= transcript.segments[startIndex]!.start && segment.end <= endTime,
  );
  const hook = selected[0]!.text.trim();
  const payoff = selected.at(-1)!.text.trim();
  return {
    title: titleFromHook(hook),
    description: selected.map((segment) => segment.text.trim()).join(" ").slice(0, 180),
    contentValue: "Momento autossuficiente com forte sinal retórico",
    hookText: hook,
    payoffText: payoff,
    startTime: selected[0]!.start,
    endTime,
    viralScore: Math.min(9, 7 + score / 4),
    reason: "Descoberto por sinais textuais de contraste, emoção ou transformação",
    hashtags: [],
  };
}

export function discoverTextualCandidates(
  transcript: Transcript,
  minDuration: number,
  maxDuration: number,
  limit: number,
): ClipItem[] {
  const anchors = transcript.segments
    .map((segment, index) => ({ index, score: scoreTextualImpact(segment.text) }))
    .filter((anchor) => anchor.score >= 3)
    .sort((a, b) => b.score - a.score);
  const candidates: ClipItem[] = [];
  for (const anchor of anchors) {
    const endTime = findWindowEnd(transcript.segments, anchor.index, minDuration, maxDuration);
    if (endTime === null) continue;
    const candidate = buildCandidate(transcript, anchor.index, endTime, anchor.score);
    const overlaps = candidates.some(
      (item) => candidate.startTime < item.endTime && candidate.endTime > item.startTime,
    );
    if (!overlaps) candidates.push(candidate);
    if (candidates.length >= limit) break;
  }
  return candidates;
}
