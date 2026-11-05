import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import type { DownloadedVideo, GeneratedShort, PipelineConfig, ShortClip, Transcript, VideoInfo } from "../../types.js";
import { segmentsInRange, wordsInRange } from "../clip-processing.js";
import { renderClip } from "../pipeline-video-processor.js";
import type { PublicationRepository } from "./publication-repository.js";
import type { PublicationRecord } from "./publication-types.js";
import { hashFile } from "./publish-service.js";

export interface RegenerateDeps {
  readonly repo: PublicationRepository;
  readonly resolveConfig: (channelId: string) => Promise<PipelineConfig>;
  readonly render?: (video: VideoInfo, clip: ShortClip, audio: DownloadedVideo, config: PipelineConfig) => Promise<GeneratedShort>;
}

export function loadTranscriptCache(config: PipelineConfig, videoId: string): Transcript | null {
  const file = path.join(config.outputDir, "transcripts", `${videoId}.json`);
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as Transcript) : null;
}

export function clipForBounds(p: PublicationRecord, transcript: Transcript): ShortClip {
  const start = p.sourceStartSec;
  const end = p.sourceEndSec;
  return {
    id: nanoid(10), videoId: p.sourceVideoId, title: p.title, presenter: p.presenter ?? undefined,
    description: p.descriptionBody, startTime: start, endTime: end, duration: end - start,
    viralScore: 0, reason: p.selectionReason, hashtags: p.tags,
    transcript: segmentsInRange(transcript.segments, start, end),
    words: wordsInRange(transcript.words, start, end),
  };
}

/** Rebuilds subtitle + artifact for edited bounds, then returns the item to review with a new version. */
export async function regeneratePublication(id: string, version: number, deps: RegenerateDeps): Promise<"regenerated" | "skipped" | "failed"> {
  const p = await deps.repo.get(id);
  if (!p || p.status !== "regenerating" || p.version !== version) return "skipped";
  const fail = async (error: string) => {
    await deps.repo.transition(id, ["regenerating"], "failed", { error });
    return "failed" as const;
  };
  const config = await deps.resolveConfig(p.channelId);
  const transcript = loadTranscriptCache(config, p.sourceVideoId);
  if (!transcript) return fail("transcript cache missing: cannot rebuild subtitles");
  if (p.sourceEndSec > transcript.duration || p.sourceEndSec - p.sourceStartSec < 1) return fail("bounds outside the source video");

  const video: VideoInfo = { id: p.sourceVideoId, title: p.title, url: p.sourceUrl, channelName: "", channelUrl: "", duration: transcript.duration, publishedAt: "" };
  const audio: DownloadedVideo = { ...video, filePath: "", audioPath: "", fileSize: 0 };
  try {
    const short = await (deps.render ?? renderClip)(video, clipForBounds(p, transcript), audio, config);
    await deps.repo.attachArtifact(id, {
      artifactPath: short.outputPath, subtitlePath: short.subtitlePath, artifactHash: await hashFile(short.outputPath),
      title: p.title, descriptionBody: p.descriptionBody, tags: p.tags, presenter: p.presenter, language: p.language,
      selectionReason: p.selectionReason, reviewNotes: p.reviewNotes, requiresHumanReview: p.requiresHumanReview, theme: p.theme,
    }, "pending_review");
    return "regenerated";
  } catch (error) {
    return fail(`regeneration failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
