import type { PipelineConfig, Transcript } from "../types.js";
import { scheduleAbort } from "./abort-timeout.js";
import { createModel } from "./ai-provider.js";
import type { ClipItem } from "./analyzer-schema.js";
import { scoreTextualImpact } from "./candidate-discovery.js";
import { buildReviewPrompt } from "./clip-quality-prompt.js";
import { failedChecks, isApproved, ReviewSchema, type Review } from "./clip-quality-schema.js";
import { generateJsonObject } from "./generate-json.js";
import { logger } from "./logger.js";
import { dropSponsoredClips } from "./sponsor-policy.js";

/** "unavailable" = the reviewer did not answer; it says nothing about the clips' quality. */
export interface ReviewOutcome {
  approved: ClipItem[];
  rejected: ClipItem[];
  status: "ok" | "unavailable";
  reasons: { title: string; reason: string }[];
}

function hasStructuralProof(clip: ClipItem, transcript: Transcript, config: PipelineConfig): boolean {
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

export async function reviewClipOutcome(
  clips: ClipItem[],
  transcript: Transcript,
  config: PipelineConfig,
): Promise<ReviewOutcome> {
  const clean = dropSponsoredClips(clips, transcript);
  const sponsored = clips.filter((clip) => !clean.includes(clip));
  const reasons = sponsored.map((clip) => ({ title: clip.title, reason: "Trecho patrocinado" }));
  if (clean.length === 0) return { approved: [], rejected: sponsored, status: "ok", reasons };
  const controller = new AbortController();
  const timeoutId = scheduleAbort(controller, config.aiTimeoutMs ?? 300_000);
  try {
    const result = await generateJsonObject<{ reviews: Review[] }>({
      model: createModel(config),
      schema: ReviewSchema,
      prompt: buildReviewPrompt(
        clean, transcript, config.minShortDuration, config.maxShortDuration,
        config.sourceBrief ?? "",
      ),
      temperature: 0.2,
      maxRetries: 3,
      abortSignal: controller.signal,
    });
    const reviews = new Map(result.reviews.map((review) => [review.candidateIndex, review]));
    const minimumScore = Math.max(7, config.minViralScore ?? 7);
    const approved: ClipItem[] = [];
    const rejected = [...sponsored];
    clean.forEach((clip, index) => {
      const review = reviews.get(index);
      if (review && isApproved(review, minimumScore)) {
        approved.push({ ...clip, viralScore: review.editorialScore, reason: review.reason });
        return;
      }
      const failed = review ? failedChecks(review) : [];
      reasons.push({
        title: clip.title,
        reason: review ? `${review.reason} ${failed.join(",")}`.trim() : "Sem revisão",
      });
      logger.info({ title: clip.title, review }, "Clip rejected by editorial quality review");
      rejected.push(clip);
    });
    approved.sort((a, b) => b.viralScore - a.viralScore);
    return { approved, rejected, status: "ok", reasons };
  } catch (error) {
    logger.error({ error }, "Editorial quality review unavailable");
    // Degraded mode: only literal hook+payoff with full rhetoric survive an offline reviewer.
    const proven = clean.filter((clip) => hasStructuralProof(clip, transcript, config));
    return {
      approved: proven.map((clip) => ({
        ...clip,
        viralScore: Math.max(8, clip.viralScore),
        reason: "Gancho e payoff literais com estrutura retórica completa (revisor indisponível)",
      })),
      rejected: [...sponsored, ...clean.filter((clip) => !proven.includes(clip))],
      status: "unavailable",
      reasons,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function reviewClipCandidates(
  clips: ClipItem[],
  transcript: Transcript,
  config: PipelineConfig,
): Promise<ClipItem[]> {
  return (await reviewClipOutcome(clips, transcript, config)).approved;
}
