import type { PipelineResult } from "../../types.js";

export const RUN_STATUSES = [
  "queued", "processing", "generated", "review_pending", "publish_pending",
  "published", "partial_failure", "failed",
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

/** Terminal for the worker (publication may still move review/publish statuses later). */
export const SETTLED_STATUSES: readonly RunStatus[] = ["generated", "review_pending", "publish_pending", "published", "partial_failure", "failed"];

const FAILED = new Set(["failed", "reconcile_required"]);
const REVIEW = new Set(["pending_review", "regenerating", "review_pending", "held"]);
const PENDING = new Set(["publish_pending", "publishing", "reserved"]);

/**
 * Truthful run status: errors are never reported as success, queued uploads are
 * never reported as published. `publicationStatuses` (from the DB) wins over the
 * snapshot stored in the results.
 */
export function deriveRunStatus(results: readonly PipelineResult[], publicationStatuses?: readonly string[]): RunStatus {
  const errors = results.reduce((n, r) => n + r.errors.length, 0);
  const shorts = results.flatMap((r) => r.shorts);
  const statuses = publicationStatuses ?? shorts.map((s) => s.publicationStatus ?? "generated");
  if (errors > 0) return shorts.length > 0 || statuses.length > 0 ? "partial_failure" : "failed";
  if (statuses.some((s) => FAILED.has(s))) return statuses.every((s) => FAILED.has(s)) ? "failed" : "partial_failure";
  if (statuses.some((s) => REVIEW.has(s))) return "review_pending";
  if (statuses.some((s) => PENDING.has(s))) return "publish_pending";
  if (statuses.length > 0 && statuses.every((s) => s === "published")) return "published";
  return "generated";
}

/** Drops transcript/word arrays so persisted results stay small. */
export function compactResults(results: readonly PipelineResult[]): PipelineResult[] {
  return results.map((r) => ({
    ...r,
    shorts: r.shorts.map((s) => ({ ...s, clip: { ...s.clip, transcript: [], words: [] } })),
  }));
}

export interface RunSummary {
  readonly videos: number;
  readonly shorts: number;
  readonly errors: string[];
  readonly byPublicationStatus: Record<string, number>;
}

export function summarizeRun(results: readonly PipelineResult[], publicationStatuses: readonly string[] = []): RunSummary {
  const byPublicationStatus: Record<string, number> = {};
  for (const s of publicationStatuses) byPublicationStatus[s] = (byPublicationStatus[s] ?? 0) + 1;
  return {
    videos: results.length,
    shorts: results.reduce((n, r) => n + r.shorts.length, 0),
    errors: results.flatMap((r) => r.errors).slice(0, 50),
    byPublicationStatus,
  };
}
