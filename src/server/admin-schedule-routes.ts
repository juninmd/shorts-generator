import type { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { logger } from "../core/logger.js";
import { channelIdSchema } from "./admin-schemas.js";
import { scheduleEntrySchema } from "./admin-cut-schemas.js";
import type { AdminDeps } from "./admin-helpers.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export function registerScheduleRoutes(admin: Hono, deps: AdminDeps): void {
  const { scheduleRepository, cutsRepository } = deps;

  admin.get("/channels/:channelId/schedule", async (c) => {
    const channelId = channelIdSchema.parse(c.req.param("channelId"));
    const from = c.req.query("from") ?? new Date().toISOString();
    const to = c.req.query("to") ?? new Date(Date.parse(from) + 7 * DAY_MS).toISOString();
    return c.json(await scheduleRepository.listEntries(channelId, from, to));
  });

  admin.post("/channels/:channelId/schedule", async (c) => {
    const channelId = channelIdSchema.parse(c.req.param("channelId"));
    const parsed = scheduleEntrySchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: "Invalid request", details: parsed.error.flatten() }, 400);
    }
    const cutId = parsed.data.cutId ?? null;
    if (cutId) {
      const cuts = await cutsRepository.listCuts(channelId);
      if (!cuts.some((cut) => cut.id === cutId)) {
        return c.json({ error: "Cut not found for this channel" }, 404);
      }
    }
    const id = randomUUID();
    await scheduleRepository.addEntry({
      id,
      channelId,
      cutId,
      kind: parsed.data.kind,
      runAt: parsed.data.runAt,
      createdAt: new Date().toISOString(),
    });
    logger.info({ channelId, action: "schedule-create" }, "Schedule entry saved");
    return c.json({ id }, 201);
  });

  admin.delete("/channels/:channelId/schedule/:entryId", async (c) => {
    const channelId = channelIdSchema.parse(c.req.param("channelId"));
    const removed = await scheduleRepository.deleteEntry(channelId, c.req.param("entryId"));
    if (!removed) {
      return c.json({ error: "Schedule entry not found" }, 404);
    }
    logger.info({ channelId, action: "schedule-delete" }, "Schedule entry removed");
    return c.json({ status: "deleted" });
  });
}
