import { createHash } from "node:crypto";
import fs from "node:fs";
import type { PipelineConfig } from "../../types.js";
import { logger } from "../logger.js";
import { incrementDailyUploadCountAsync } from "../state.js";
import { composeDescription } from "../metadata/description.js";
import { validateMetadataDraft } from "../metadata/metadata-validation.js";
import type { PublicationRepository } from "./publication-repository.js";
import type { PublicationRecord } from "./publication-types.js";
import { reconciliationTag, uploadWithOutcome, type UploadOutcome, type UploadRequest } from "./youtube-publisher.js";

export class RetryablePublishError extends Error {}

export interface PublishDeps {
  readonly repo: PublicationRepository;
  /** Resolves current credentials by channel reference at execution time. */
  readonly resolveConfig: (channelId: string) => Promise<PipelineConfig>;
  readonly upload?: (request: UploadRequest, config: PipelineConfig) => Promise<UploadOutcome>;
  readonly afterPublish?: (publication: PublicationRecord, url: string, config: PipelineConfig) => Promise<void>;
}

export type PublishResult = { readonly status: "published" | "failed" | "reconcile_required" | "skipped"; readonly detail?: string };

export async function hashFile(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

export async function publishPublication(id: string, version: number, deps: PublishDeps): Promise<PublishResult> {
  const { repo } = deps;
  const publication = await repo.get(id);
  if (!publication) return { status: "skipped", detail: "publication not found" };
  if (publication.status === "published") return { status: "skipped", detail: "already published" };
  if (!(await repo.claimForPublish(id, version))) {
    return { status: "skipped", detail: `not publishable at version ${version} (status ${publication.status})` };
  }
  const fail = async (detail: string): Promise<PublishResult> => {
    await repo.transition(id, ["publishing"], "failed", { error: detail });
    return { status: "failed", detail };
  };

  if (!publication.artifactPath || !fs.existsSync(publication.artifactPath)) return fail("artifact missing");
  if (publication.artifactHash && (await hashFile(publication.artifactPath)) !== publication.artifactHash) {
    return fail("artifact changed after approval");
  }
  const check = validateMetadataDraft(
    { title: publication.title, description: publication.descriptionBody, tags: publication.tags },
    { language: publication.language, transcript: publication.normalizedText, presenter: publication.presenter },
  );
  if (!check.ok) return fail(`invalid metadata: ${check.reasons.join("; ")}`);

  let config: PipelineConfig;
  try {
    config = await deps.resolveConfig(publication.channelId);
  } catch (error) {
    await repo.transition(id, ["publishing"], "publish_pending", { error: String(error) });
    throw new RetryablePublishError(`credentials unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }

  const request: UploadRequest = {
    videoPath: publication.artifactPath,
    title: publication.title,
    description: composeDescription(publication.descriptionBody, publication.sourceUrl, publication.presenter),
    tags: [...publication.tags, reconciliationTag(publication.id)],
  };
  const outcome = await (deps.upload ?? uploadWithOutcome)(request, config);
  switch (outcome.kind) {
    case "published":
      await repo.markPublished(id, outcome.videoId);
      await incrementDailyUploadCountAsync(publication.channelId);
      await deps.afterPublish?.(publication, outcome.url, config).catch((error) =>
        logger.warn({ id, error: String(error) }, "Post-publish hook failed"));
      return { status: "published", detail: outcome.url };
    case "uncertain":
      await repo.transition(id, ["publishing"], "reconcile_required", { error: outcome.error });
      logger.error({ id, error: outcome.error }, "Upload outcome unknown: reconciliation required, no automatic retry");
      return { status: "reconcile_required", detail: outcome.error };
    default:
      if (outcome.retryable) {
        await repo.transition(id, ["publishing"], "publish_pending", { error: outcome.error });
        throw new RetryablePublishError(outcome.error);
      }
      return fail(outcome.error);
  }
}
