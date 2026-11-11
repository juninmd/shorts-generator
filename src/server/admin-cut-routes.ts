import type { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { logger } from "../core/logger.js";
import { channelIdSchema } from "./admin-schemas.js";
import { manualCutSchema } from "./admin-cut-schemas.js";
import type { AdminDeps } from "./admin-helpers.js";

export function registerCutRoutes(admin: Hono, deps: AdminDeps): void {
  const { cutsRepository, analysisRepository } = deps;

  admin.get("/channels/:channelId/cuts", async (c) => {
    const channelId = channelIdSchema.parse(c.req.param("channelId"));
    return c.json(await cutsRepository.listCuts(channelId));
  });

  admin.post("/channels/:channelId/cuts", async (c) => {
    const channelId = channelIdSchema.parse(c.req.param("channelId"));
    const parsed = manualCutSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: "Invalid request", details: parsed.error.flatten() }, 400);
    }
    const id = randomUUID();
    await cutsRepository.addCut({
      id,
      channelId,
      sourceVideoId: parsed.data.sourceVideoId,
      title: parsed.data.title,
      startSec: parsed.data.startSec,
      endSec: parsed.data.endSec,
      createdAt: new Date().toISOString(),
    });
    logger.info({ channelId, action: "cut-create" }, "Manual cut saved");
    return c.json({ id }, 201);
  });

  admin.delete("/channels/:channelId/cuts/:cutId", async (c) => {
    const channelId = channelIdSchema.parse(c.req.param("channelId"));
    const removed = await cutsRepository.deleteCut(channelId, c.req.param("cutId"));
    if (!removed) {
      return c.json({ error: "Cut not found" }, 404);
    }
    logger.info({ channelId, action: "cut-delete" }, "Manual cut removed");
    return c.json({ status: "deleted" });
  });

  admin.get("/channels/:channelId/analysis/:sourceVideoId", async (c) => {
    const channelId = channelIdSchema.parse(c.req.param("channelId"));
    const analysis = await analysisRepository.getAnalysis(channelId, c.req.param("sourceVideoId"));
    if (!analysis) {
      return c.json({ error: "Analysis not found" }, 404);
    }
    return c.json(analysis);
  });
}
