import fs from "node:fs";
import type { Context, Hono } from "hono";
import { validateMetadataDraft } from "../core/metadata/metadata-validation.js";
import { logger } from "../core/logger.js";
import type { PublicationRecord } from "../core/publication/publication-types.js";
import type { AdminDeps } from "./admin-helpers.js";
import {
  boundsError, defaultOutputRoot, reconcileBodySchema, rejectBodySchema, resolveArtifact, reviewListSchema,
  reviewPatchSchema, toReviewItem, versionBodySchema,
} from "./admin-review-helpers.js";

const ACTOR = "admin";

export function registerReviewRoutes(admin: Hono, deps: AdminDeps, outputRoot = defaultOutputRoot()): void {
  const repo = deps.publications;
  if (!repo) return;

  // Optional ?channelId= scopes item routes: an item of another channel is reported as missing.
  const load = async (c: Context): Promise<PublicationRecord | null> => {
    const item = await repo.get(c.req.param("id") ?? "");
    const channelId = c.req.query("channelId");
    return item && (!channelId || item.channelId === channelId) ? item : null;
  };
  const refreshRun = async (item: PublicationRecord) => {
    if (item.runId) await deps.runRepository.refreshStatus(item.runId).catch(() => null);
  };
  const conflict = async (c: Context, id: string) =>
    c.json({ error: "Version conflict or invalid status", current: toReviewItem((await repo.get(id))!) }, 409);

  admin.get("/review-items", async (c) => {
    const filter = reviewListSchema.parse(c.req.query());
    const items = await repo.list(filter);
    return c.json({ items: items.map(toReviewItem), limit: filter.limit, offset: filter.offset });
  });

  admin.get("/review-items/:id", async (c) => {
    const item = await load(c);
    return item ? c.json(toReviewItem(item)) : c.json({ error: "Review item not found" }, 404);
  });

  admin.get("/review-items/:id/video", async (c) => {
    const item = await load(c);
    const file = item && resolveArtifact(item, outputRoot);
    if (!file) return c.json({ error: "Artifact not available" }, 404);
    return c.body(fs.readFileSync(file), 200, { "Content-Type": "video/mp4", "Cache-Control": "private, no-store" });
  });

  admin.patch("/review-items/:id", async (c) => {
    const item = await load(c);
    if (!item) return c.json({ error: "Review item not found" }, 404);
    const body = reviewPatchSchema.parse(await c.req.json());
    const title = body.title ?? item.title;
    const description = body.description ?? item.descriptionBody;
    const tags = body.tags ?? item.tags;
    const check = validateMetadataDraft({ title, description, tags },
      { language: item.language, transcript: item.normalizedText || item.descriptionBody, presenter: item.presenter });
    if (!check.ok) return c.json({ error: "Invalid metadata", reasons: check.reasons }, 422);
    const start = body.startSec ?? item.sourceStartSec;
    const end = body.endSec ?? item.sourceEndSec;
    const invalidBounds = boundsError(start, end);
    if (invalidBounds) return c.json({ error: invalidBounds }, 422);

    const ok = await repo.updateDraft(item.id, body.expectedVersion, {
      title: check.draft!.title, descriptionBody: check.draft!.description, tags: check.draft!.tags,
      reviewNotes: body.reviewNotes, startSec: start, endSec: end,
    });
    if (!ok) return conflict(c, item.id);
    const updated = (await repo.get(item.id))!;
    if (updated.status === "regenerating" && deps.enqueueRegeneration) {
      await deps.enqueueRegeneration({ publicationId: updated.id, version: updated.version });
    }
    return c.json(toReviewItem(updated));
  });

  admin.post("/review-items/:id/approve", async (c) => {
    const item = await load(c);
    if (!item) return c.json({ error: "Review item not found" }, 404);
    const { version } = versionBodySchema.parse(await c.req.json());
    if (!(await repo.approve(item.id, version, ACTOR))) {
      const current = (await repo.get(item.id))!;
      // Repeated approval of the same version is a no-op, never a second publish.
      if (current.approvedVersion === version && ["publish_pending", "publishing", "published"].includes(current.status)) {
        return c.json({ ...toReviewItem(current), idempotent: true });
      }
      return conflict(c, item.id);
    }
    if (!deps.enqueuePublication) return c.json({ error: "Publication queue not configured" }, 503);
    try {
      await deps.enqueuePublication({ publicationId: item.id, version });
    } catch (error) {
      // Approval stays recorded; the worker's recovery or a new approval call re-enqueues it.
      logger.error({ publicationId: item.id, error: error instanceof Error ? error.message : String(error) }, "Publish enqueue failed");
      return c.json({ error: "Approved, but the publication queue is unavailable" }, 503);
    }
    await refreshRun(item);
    return c.json(toReviewItem((await repo.get(item.id))!), 202);
  });

  admin.post("/review-items/:id/reject", async (c) => {
    const item = await load(c);
    if (!item) return c.json({ error: "Review item not found" }, 404);
    const { version, reason } = rejectBodySchema.parse(await c.req.json());
    const ok = await repo.transition(item.id, ["pending_review"], "rejected", { version, notes: reason });
    if (!ok) return conflict(c, item.id);
    await refreshRun(item);
    return c.json(toReviewItem((await repo.get(item.id))!));
  });

  admin.post("/review-items/:id/regenerate", async (c) => {
    const item = await load(c);
    if (!item) return c.json({ error: "Review item not found" }, 404);
    const { version } = versionBodySchema.parse(await c.req.json());
    const ok = await repo.transition(item.id, ["pending_review", "failed"], "regenerating", { version, bumpVersion: true });
    if (!ok) return conflict(c, item.id);
    const updated = (await repo.get(item.id))!;
    if (deps.enqueueRegeneration) await deps.enqueueRegeneration({ publicationId: updated.id, version: updated.version });
    return c.json(toReviewItem(updated), 202);
  });

  admin.post("/review-items/:id/reconcile", async (c) => {
    const item = await load(c);
    if (!item) return c.json({ error: "Review item not found" }, 404);
    if (item.status !== "reconcile_required") return c.json({ error: "Item does not need reconciliation" }, 409);
    const body = reconcileBodySchema.parse(await c.req.json());
    const ok = "youtubeVideoId" in body
      ? await repo.markPublished(item.id, body.youtubeVideoId)
      // Confirmed absent on YouTube: back to review with a new version, so a new approval is required.
      : await repo.transition(item.id, ["reconcile_required"], "pending_review", { bumpVersion: true, notes: "Reconciliado: não publicado" });
    if (!ok) return conflict(c, item.id);
    await refreshRun(item);
    return c.json(toReviewItem((await repo.get(item.id))!));
  });
}
