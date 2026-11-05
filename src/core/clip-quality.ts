import type { PipelineConfig, Transcript } from "../types.js";
import { scheduleAbort } from "./abort-timeout.js";
import { createModel } from "./ai-provider.js";
import type { ClipItem } from "./analyzer-schema.js";
import { generateJsonObject } from "./generate-json.js";
import { logger } from "./logger.js";
import { buildReevaluationPrompt, buildReviewPrompt, ReviewSchema, type Review } from "./clip-review-prompt.js";
import { clipText, hasStructuralProof } from "./clip-structural-proof.js";
import { buildEditorialPromptBlock, DEFAULT_EDITORIAL_PROFILE } from "./editorial/editorial-profile.js";
import { checkEditorialAdherence } from "./editorial/editorial-gate.js";
import { recordEditorialDecision, type DecisionRecorder, type EditorialDecisionKind } from "./editorial/editorial-decisions.js";

export { hasStructuralProof } from "./clip-structural-proof.js";

/** Bound on divergent candidates sent to the second opinion (one extra LLM call). */
export const MAX_REEVALUATIONS = 2;

export interface ReviewDeps {
  readonly generate?: <T>(prompt: string, config: PipelineConfig, signal: AbortSignal) => Promise<T>;
  readonly record?: DecisionRecorder;
}

const defaultGenerate = <T>(prompt: string, config: PipelineConfig, signal: AbortSignal): Promise<T> =>
  generateJsonObject<T>({ model: createModel(config), schema: ReviewSchema, prompt, temperature: 0.2, maxRetries: 3, abortSignal: signal });

function isApproved(review: Review, minimumScore: number): boolean {
  return review.approved
    && review.editorialScore >= minimumScore
    && review.hookScore >= 7
    && review.standaloneScore >= 7
    && review.payoffScore >= 7;
}

const scoresOf = (r?: Review) => (r ? { editorial: r.editorialScore, hook: r.hookScore, standalone: r.standaloneScore, payoff: r.payoffScore, approved: r.approved } : {});

export async function reviewClipCandidates(
  clips: ClipItem[],
  transcript: Transcript,
  config: PipelineConfig,
  deps: ReviewDeps = {},
): Promise<ClipItem[]> {
  if (clips.length === 0) return [];
  const generate = deps.generate ?? defaultGenerate;
  const record = deps.record ?? recordEditorialDecision;
  const profile = config.managedRun?.editorial ?? DEFAULT_EDITORIAL_PROFILE;
  const block = buildEditorialPromptBlock(profile, config.managedRun?.focusLabels ?? []);
  const minimumScore = Math.max(7, config.minViralScore ?? 7);
  const note = (clip: ClipItem, decision: EditorialDecisionKind, reasons: string[], review?: Review) =>
    record({
      runId: config.managedRun?.runId, channelId: config.managedRun?.channelId ?? "global", sourceVideoId: transcript.videoId,
      startSec: clip.startTime, endSec: clip.endTime, title: clip.title, stage: "clip_review", decision, reasons,
      scores: { ...scoresOf(review), structural: hasStructuralProof(clip, transcript, config), theme: review?.theme },
    });

  const controller = new AbortController();
  const timeoutId = scheduleAbort(controller, config.aiTimeoutMs ?? 300_000);
  try {
    let reviews: Map<number, Review>;
    try {
      const result = await generate<{ reviews: Review[] }>(buildReviewPrompt(clips, transcript, config.minShortDuration, config.maxShortDuration, block), config, controller.signal);
      reviews = new Map(result.reviews.map((review) => [review.candidateIndex, review]));
    } catch (error) {
      logger.error({ error }, "Editorial quality review unavailable; rejecting all candidates");
      for (const clip of clips) await note(clip, "rejected", ["revisão editorial indisponível"]);
      return [];
    }

    const accepted: ClipItem[] = [];
    const divergent: { clip: ClipItem; review: Review }[] = [];
    for (const [index, clip] of clips.entries()) {
      const review = reviews.get(index);
      if (!review) { await note(clip, "rejected", ["revisão ausente para o candidato"]); continue; }
      const adherence = checkEditorialAdherence(clipText(clip, transcript), profile, review.themeAllowed);
      if (!adherence.ok) { await note(clip, "rejected", adherence.reasons, review); continue; }
      if (isApproved(review, minimumScore)) {
        accepted.push({ ...clip, viralScore: review.editorialScore, reason: review.reason, theme: review.theme });
        await note(clip, "approved", [review.reason], review);
      } else if (hasStructuralProof(clip, transcript, config) && divergent.length < MAX_REEVALUATIONS) {
        divergent.push({ clip, review });
      } else {
        await note(clip, "rejected", [review.reason], review);
      }
    }

    if (divergent.length > 0) {
      const disputed = divergent.map((d) => d.clip);
      try {
        const second = await generate<{ reviews: Review[] }>(buildReevaluationPrompt(disputed, transcript, divergent.map((d) => d.review), block), config, controller.signal);
        const byIndex = new Map(second.reviews.map((r) => [r.candidateIndex, r]));
        for (const [i, { clip, review }] of divergent.entries()) {
          const again = byIndex.get(i);
          if (again && isApproved(again, minimumScore) && again.themeAllowed !== false) {
            accepted.push({ ...clip, viralScore: again.editorialScore, reason: again.reason, theme: again.theme, editorialNotes: `1ª revisão reprovou: ${review.reason} | reavaliação aprovou: ${again.reason}` });
            await note(clip, "reevaluated_approved", [review.reason, again.reason], again);
          } else {
            await note(clip, "reevaluated_rejected", [review.reason, again?.reason ?? "reavaliação sem resposta para o candidato"], again ?? review);
          }
        }
      } catch (error) {
        logger.warn({ error }, "Re-evaluation unavailable; divergent clips go to human review only");
        for (const { clip, review } of divergent) {
          accepted.push({ ...clip, viralScore: review.editorialScore, reason: review.reason, requiresHumanReview: true, editorialNotes: `Divergência: revisão reprovou (${review.reason}); heurística estrutural favorável; reavaliação indisponível.` });
          await note(clip, "needs_human", [review.reason, "reavaliação indisponível"], review);
        }
      }
    }
    return accepted.sort((a, b) => b.viralScore - a.viralScore);
  } finally {
    clearTimeout(timeoutId);
  }
}
