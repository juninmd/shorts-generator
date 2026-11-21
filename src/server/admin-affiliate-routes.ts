import type { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { logger } from "../core/logger.js";
import { channelIdSchema } from "./admin-schemas.js";
import type { AdminDeps } from "./admin-helpers.js";

const affiliateLinkSchema = z.object({
  name: z.string().trim().min(1).max(100),
  url: z.string().trim().url().max(300).refine((u) => u.startsWith("https://"), "Use https"),
  position: z.number().int().min(0).max(10000).optional(),
});
const activeSchema = z.object({ active: z.boolean() });

export function registerAffiliateRoutes(admin: Hono, deps: AdminDeps): void {
  const { affiliateRepository } = deps;

  // Pool global: vale para todos os canais, inclusive os criados depois.
  admin.get("/affiliate-links", async (c) => {
    return c.json(await affiliateRepository.listGlobalLinks());
  });

  admin.post("/affiliate-links", async (c) => {
    const parsed = affiliateLinkSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: "Invalid request", details: parsed.error.flatten() }, 400);
    }
    const id = randomUUID();
    const created = await affiliateRepository.addGlobalLink({
      id,
      name: parsed.data.name,
      url: parsed.data.url,
      active: true,
      position: parsed.data.position ?? 0,
      createdAt: new Date().toISOString(),
    });
    if (!created) return c.json({ error: "Link already registered" }, 409);
    logger.info({ action: "affiliate-global-create" }, "Global affiliate link saved");
    return c.json({ id }, 201);
  });

  admin.patch("/affiliate-links/:linkId", async (c) => {
    const parsed = activeSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: "Invalid request", details: parsed.error.flatten() }, 400);
    }
    const updated = await affiliateRepository.setGlobalActive(c.req.param("linkId"), parsed.data.active);
    return updated ? c.json({ status: "ok" }) : c.json({ error: "Link not found" }, 404);
  });

  admin.delete("/affiliate-links/:linkId", async (c) => {
    const removed = await affiliateRepository.deleteGlobalLink(c.req.param("linkId"));
    if (!removed) return c.json({ error: "Link not found" }, 404);
    logger.info({ action: "affiliate-global-delete" }, "Global affiliate link removed");
    return c.json({ status: "deleted" });
  });

  admin.get("/channels/:channelId/affiliate-links", async (c) => {
    const channelId = channelIdSchema.parse(c.req.param("channelId"));
    return c.json(await affiliateRepository.listLinks(channelId));
  });

  admin.post("/channels/:channelId/affiliate-links", async (c) => {
    const channelId = channelIdSchema.parse(c.req.param("channelId"));
    const parsed = affiliateLinkSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: "Invalid request", details: parsed.error.flatten() }, 400);
    }
    const id = randomUUID();
    const created = await affiliateRepository.addLink({
      id,
      channelId,
      name: parsed.data.name,
      url: parsed.data.url,
      active: true,
      position: parsed.data.position ?? 0,
      createdAt: new Date().toISOString(),
    });
    if (!created) return c.json({ error: "Link already registered" }, 409);
    logger.info({ channelId, action: "affiliate-create" }, "Affiliate link saved");
    return c.json({ id }, 201);
  });

  admin.patch("/channels/:channelId/affiliate-links/:linkId", async (c) => {
    const channelId = channelIdSchema.parse(c.req.param("channelId"));
    const parsed = activeSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: "Invalid request", details: parsed.error.flatten() }, 400);
    }
    const updated = await affiliateRepository.setActive(channelId, c.req.param("linkId"), parsed.data.active);
    return updated ? c.json({ status: "ok" }) : c.json({ error: "Link not found" }, 404);
  });

  admin.delete("/channels/:channelId/affiliate-links/:linkId", async (c) => {
    const channelId = channelIdSchema.parse(c.req.param("channelId"));
    const removed = await affiliateRepository.deleteLink(channelId, c.req.param("linkId"));
    if (!removed) return c.json({ error: "Link not found" }, 404);
    logger.info({ channelId, action: "affiliate-delete" }, "Affiliate link removed");
    return c.json({ status: "deleted" });
  });
}
