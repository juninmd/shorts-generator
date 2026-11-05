export const PUBLICATION_STATUSES = [
  "reserved",            // interval claimed, rendering not finished
  "generated",           // artifact ready, YouTube disabled for this run
  "pending_review",      // waiting for a human decision
  "regenerating",        // bounds edited, artifact being rebuilt
  "publish_pending",     // approved (auto or human), waiting for the publish worker
  "publishing",          // upload claimed by a worker
  "published",
  "reconcile_required",  // upload outcome unknown: never retried blindly
  "failed",              // recoverable failure: does not block the interval
  "rejected",
  "expired",             // stale reservation lease
] as const;

export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

/** Statuses that do not block a new reservation of the same content. */
export const RELEASED_STATUSES: readonly PublicationStatus[] = ["failed", "rejected", "expired"];

export interface PublicationRecord {
  readonly id: string;
  readonly channelId: string;
  readonly runId: string | null;
  readonly sourceVideoId: string;
  readonly sourceUrl: string;
  readonly sourceStartSec: number;
  readonly sourceEndSec: number;
  readonly textSignature: string;
  readonly normalizedText: string;
  readonly status: PublicationStatus;
  readonly version: number;
  readonly approvedVersion: number | null;
  readonly approvedBy: string | null;
  readonly title: string;
  readonly descriptionBody: string;
  readonly tags: string[];
  readonly presenter: string | null;
  readonly language: string;
  readonly selectionReason: string;
  readonly reviewNotes: string;
  readonly requiresHumanReview: boolean;
  readonly artifactPath: string | null;
  readonly subtitlePath: string | null;
  readonly artifactHash: string | null;
  readonly format: string;
  readonly theme: string | null;
  readonly youtubeVideoId: string | null;
  readonly publishedAt: string | null;
  readonly attemptCount: number;
  readonly lastError: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ReservationInput {
  readonly channelId: string;
  readonly runId?: string;
  readonly sourceVideoId: string;
  readonly sourceUrl: string;
  readonly startSec: number;
  readonly endSec: number;
  readonly text: string;
  readonly format?: string;
  readonly leaseMs?: number;
}

export type ReservationResult =
  | { readonly reserved: true; readonly id: string }
  | { readonly reserved: false; readonly reason: "overlap" | "duplicate_text"; readonly conflictId?: string };

export interface ArtifactInput {
  readonly artifactPath: string;
  readonly subtitlePath: string;
  readonly artifactHash: string;
  readonly title: string;
  readonly descriptionBody: string;
  readonly tags: readonly string[];
  readonly presenter: string | null;
  readonly language: string;
  readonly selectionReason: string;
  readonly reviewNotes: string;
  readonly requiresHumanReview: boolean;
  readonly theme?: string | null;
}

export function mapPublicationRow(r: Record<string, any>): PublicationRecord {
  const json = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : v ?? []);
  return {
    id: r.id, channelId: r.channel_id, runId: r.run_id ?? null, sourceVideoId: r.source_video_id, sourceUrl: r.source_url,
    sourceStartSec: Number(r.source_start_ms) / 1000, sourceEndSec: Number(r.source_end_ms) / 1000,
    textSignature: r.text_signature, normalizedText: r.normalized_text ?? "", status: r.status, version: Number(r.version),
    approvedVersion: r.approved_version == null ? null : Number(r.approved_version), approvedBy: r.approved_by ?? null,
    title: r.title, descriptionBody: r.description_body, tags: json(r.tags), presenter: r.presenter ?? null,
    language: r.language, selectionReason: r.selection_reason, reviewNotes: r.review_notes,
    requiresHumanReview: Boolean(r.requires_human_review), artifactPath: r.artifact_path ?? null,
    subtitlePath: r.subtitle_path ?? null, artifactHash: r.artifact_hash ?? null, format: r.format, theme: r.theme ?? null,
    youtubeVideoId: r.youtube_video_id ?? null, publishedAt: r.published_at ?? null,
    attemptCount: Number(r.attempt_count ?? 0), lastError: r.last_error ?? null,
    createdAt: String(r.created_at), updatedAt: String(r.updated_at),
  };
}
