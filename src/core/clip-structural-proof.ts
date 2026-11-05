import type { PipelineConfig, Transcript } from "../types.js";
import type { ClipItem } from "./analyzer-schema.js";
import { scoreTextualImpact } from "./candidate-discovery.js";

/**
 * Heuristic evidence that a candidate has literal hook/payoff boundaries and a
 * complete rhetorical structure. Auxiliary only: it never approves on its own.
 */
export function hasStructuralProof(
  clip: ClipItem,
  transcript: Transcript,
  config: PipelineConfig,
): boolean {
  const duration = clip.endTime - clip.startTime;
  if (duration < config.minShortDuration || duration > config.maxShortDuration) return false;
  const segments = transcript.segments.filter(
    (segment) => segment.end > clip.startTime && segment.start < clip.endTime,
  );
  if (segments.length < 2 || !clip.hookText || !clip.payoffText) return false;
  const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();
  const literalBoundaries = normalize(clip.hookText) === normalize(segments[0]!.text)
    && normalize(clip.payoffText) === normalize(segments.at(-1)!.text);
  const completeEnding = /[.!?]$/.test(clip.payoffText.trim())
    && !clip.payoffText.trim().endsWith("...");
  return literalBoundaries && completeEnding
    && scoreTextualImpact(clip.hookText) >= 4
    && scoreTextualImpact(clip.payoffText) >= 2;
}

export function clipText(clip: ClipItem, transcript: Transcript): string {
  const spoken = transcript.segments
    .filter((s) => s.end > clip.startTime && s.start < clip.endTime)
    .map((s) => s.text)
    .join(" ");
  return `${clip.title} ${clip.description} ${spoken}`;
}
