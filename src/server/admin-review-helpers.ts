import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { PUBLICATION_STATUSES, type PublicationRecord } from "../core/publication/publication-types.js";

export const MIN_CLIP_SEC = 5;
export const MAX_CLIP_SEC = 180;

export const reviewListSchema = z.object({
  channelId: z.string().min(1).optional(),
  status: z.enum(PUBLICATION_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const reviewPatchSchema = z.object({
  expectedVersion: z.number().int().positive(),
  title: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).max(15).optional(),
  reviewNotes: z.string().max(2000).optional(),
  startSec: z.number().nonnegative().optional(),
  endSec: z.number().positive().optional(),
}).strict();

export const versionBodySchema = z.object({ version: z.number().int().positive() }).strict();
export const rejectBodySchema = z.object({ version: z.number().int().positive(), reason: z.string().trim().min(3).max(500) }).strict();
export const reconcileBodySchema = z.union([
  z.object({ youtubeVideoId: z.string().regex(/^[\w-]{6,20}$/) }).strict(),
  z.object({ notPublished: z.literal(true) }).strict(),
]);

export function boundsError(start: number, end: number): string | null {
  if (end <= start) return "endSec must be greater than startSec";
  const duration = end - start;
  if (duration < MIN_CLIP_SEC || duration > MAX_CLIP_SEC) return `duration must be between ${MIN_CLIP_SEC}s and ${MAX_CLIP_SEC}s`;
  return null;
}

/** Only files under the output directory can be streamed, whatever the stored path says. */
export function resolveArtifact(record: PublicationRecord, outputRoot: string): string | null {
  if (!record.artifactPath) return null;
  const root = path.resolve(outputRoot);
  const file = path.resolve(record.artifactPath);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return null;
  return file;
}

export const defaultOutputRoot = () => path.resolve(process.env.OUTPUT_DIR ?? "./output");

export function toReviewItem(p: PublicationRecord) {
  return {
    id: p.id, channelId: p.channelId, runId: p.runId, status: p.status, version: p.version,
    approvedVersion: p.approvedVersion, approvedBy: p.approvedBy,
    title: p.title, description: p.descriptionBody, tags: p.tags, presenter: p.presenter, language: p.language,
    source: { videoId: p.sourceVideoId, url: p.sourceUrl, startSec: p.sourceStartSec, endSec: p.sourceEndSec },
    selectionReason: p.selectionReason, reviewNotes: p.reviewNotes, requiresHumanReview: p.requiresHumanReview,
    theme: p.theme, format: p.format, hasArtifact: Boolean(p.artifactPath), youtubeVideoId: p.youtubeVideoId,
    publishedAt: p.publishedAt, lastError: p.lastError, createdAt: p.createdAt, updatedAt: p.updatedAt,
  };
}
