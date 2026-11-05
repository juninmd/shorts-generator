import fs from "node:fs";
import path from "node:path";
import type { GeneratedShort, PipelineConfig, ShortClip, Transcript, VideoInfo } from "../../types.js";
import { getOptionalPool, type SqlClient } from "../control-plane-db.js";
import { DEFAULT_EDITORIAL_PROFILE } from "../editorial/editorial-profile.js";
import { logger } from "../logger.js";
import { isDailyLimitReachedAsync } from "../state.js";
import { notifyYoutubePublished } from "../telegram.js";
import { addCommentToVideo, buildEngagementComment } from "../youtube-comment.service.js";
import type { YoutubeMetadata } from "../youtube-metadata.service.js";
import { reserveClip } from "./clip-reservation.js";
import { enqueuePublication } from "./publication-queue.js";
import { PublicationRepository } from "./publication-repository.js";
import type { PublicationStatus } from "./publication-types.js";
import { hashFile, publishPublication, RetryablePublishError, type PublishDeps } from "./publish-service.js";

export interface DeliveryOutcome {
  readonly status: PublicationStatus;
  readonly youtubeUrl?: string;
}

export function publicationStore(): SqlClient | null {
  return getOptionalPool();
}

export const clipSpokenText = (clip: ShortClip) => clip.transcript.map((s) => s.text).join(" ") || clip.title;

/** Returns the reservation id, or null when the interval/content is already taken on this channel. */
export async function reserveForClip(db: SqlClient, video: VideoInfo, clip: ShortClip, config: PipelineConfig): Promise<string | null> {
  const result = await reserveClip(db, {
    channelId: config.managedRun?.channelId ?? "global",
    runId: config.managedRun?.runId,
    sourceVideoId: video.id,
    sourceUrl: video.url,
    startSec: clip.startTime,
    endSec: clip.endTime,
    text: clipSpokenText(clip),
  });
  if (!result.reserved) {
    logger.info({ videoId: video.id, clipId: clip.id, reason: result.reason, conflictId: result.conflictId }, "Clip skipped: already reserved/published on this channel");
    return null;
  }
  return result.id;
}

/** Keeps the full transcript so a review edit can regenerate subtitles for new bounds. */
export function saveTranscriptCache(config: PipelineConfig, transcript: Transcript): void {
  const dir = path.join(config.outputDir, "transcripts");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${transcript.videoId}.json`), JSON.stringify(transcript));
}

export function publishDepsFor(db: SqlClient, config: PipelineConfig): PublishDeps {
  return {
    repo: new PublicationRepository(db),
    resolveConfig: async () => config,
    afterPublish: async (publication, url, cfg) => {
      const videoId = url.split("/").pop()!;
      await addCommentToVideo(videoId, buildEngagementComment(publication.sourceUrl, cfg.managedRun?.focusLabels), cfg);
      await notifyYoutubePublished({ videoId, url, title: publication.title, channelName: cfg.managedRun?.channelName, isShort: true, tags: publication.tags, description: publication.descriptionBody }, cfg);
    },
  };
}

export async function deliverWithPublication(
  db: SqlClient,
  short: GeneratedShort,
  meta: YoutubeMetadata,
  config: PipelineConfig,
  deps: PublishDeps = publishDepsFor(db, config),
): Promise<DeliveryOutcome> {
  const repo = deps.repo;
  const id = short.publicationId!;
  const mode = config.managedRun?.editorial?.publishMode ?? DEFAULT_EDITORIAL_PROFILE.publishMode;
  const youtubeEnabled = process.env.ENABLE_YOUTUBE === "true";
  const needsHuman = meta.held || !!short.clip.requiresHumanReview || mode === "review";
  const next = !youtubeEnabled ? "generated" : needsHuman ? "pending_review" : "publish_pending";
  const notes = [short.clip.editorialNotes, meta.held ? `Metadados retidos: ${meta.heldReasons.join("; ")}` : ""].filter(Boolean).join("\n");
  await repo.attachArtifact(id, {
    artifactPath: short.outputPath, subtitlePath: short.subtitlePath, artifactHash: await hashFile(short.outputPath),
    title: meta.title, descriptionBody: meta.descriptionBody, tags: meta.tags, presenter: meta.presenter,
    language: meta.language, selectionReason: short.clip.reason, reviewNotes: notes,
    requiresHumanReview: !!short.clip.requiresHumanReview, theme: short.clip.theme,
  }, next);
  if (next !== "publish_pending") return { status: next };

  const record = await repo.get(id);
  const job = { publicationId: id, version: record!.version };
  const channelId = config.managedRun?.channelId || "global";
  if (process.env.DEFER_UPLOADS === "true" || await isDailyLimitReachedAsync(config.dailyUploadLimit, channelId)) {
    await enqueuePublication(job);
    return { status: "publish_pending" };
  }
  try {
    const result = await publishPublication(id, job.version, deps);
    if (result.status === "published") return { status: "published", youtubeUrl: result.detail };
    return { status: result.status === "skipped" ? "publish_pending" : result.status };
  } catch (error) {
    if (!(error instanceof RetryablePublishError)) throw error;
    await enqueuePublication(job);
    return { status: "publish_pending" };
  }
}
