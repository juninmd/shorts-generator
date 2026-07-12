/* v8 ignore start */
import type { Hono } from "hono";
import { google } from "googleapis";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { logger } from "../core/logger.js";
import { bundleSchema, channelIdSchema, focusSchema, publishingAccountSchema, sourceSchema } from "./admin-schemas.js";
import { type AdminDeps, buildPublishingAccount, isCutsOnlyMode, toAdminBundleResponse } from "./admin-helpers.js";

export function registerChannelRoutes(admin: Hono, deps: AdminDeps): void {
  const { repository, secretStore, resolver } = deps;

  admin.get("/channels", async (c) => {
    const bundles = await repository.listBundles();
    return c.json(bundles.map(toAdminBundleResponse));
  });

  admin.get("/channels/:channelId", async (c) => {
    const channelId = channelIdSchema.parse(c.req.param("channelId"));
    const bundle = await repository.getBundle(channelId);
    if (!bundle) {
      return c.json({ error: "Channel not found" }, 404);
    }
    return c.json(toAdminBundleResponse(bundle));
  });

  admin.put("/channels/:channelId", async (c) => {
    const adminId = "system";
    const channelId = channelIdSchema.parse(c.req.param("channelId"));
    const parsed = bundleSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      logger.warn({ channelId, action: "save" }, "Admin mutation failed");
      return c.json({ error: "Invalid request", details: parsed.error.flatten() }, 400);
    }

    const now = new Date().toISOString();
    const existing = await repository.getBundle(channelId);
    const payload = parsed.data;
    if (isCutsOnlyMode() && payload.channelType !== "cuts") {
      return c.json({ error: "Quiz channels are disabled while CHANNEL_FLOW_MODE=cuts" }, 409);
    }
    const publishingAccounts = payload.publishingAccounts.map((accountPayload: z.infer<typeof publishingAccountSchema>) =>
      buildPublishingAccount(channelId, accountPayload, existing, secretStore, now),
    );

    await repository.saveBundle({
      channel: {
        id: channelId,
        slug: payload.slug,
        name: payload.name,
        description: payload.description,
        status: payload.status,
        logoPath: payload.logoPath ?? null,
        watermarkText: payload.watermarkText,
        channelType: payload.channelType,
        createdAt: existing?.channel.createdAt ?? now,
        updatedAt: now,
      },
      profile: {
        channelId,
        videoLimit: payload.profile.videoLimit,
        minShortDuration: payload.profile.minShortDuration,
        maxShortDuration: payload.profile.maxShortDuration,
        targetShorts: payload.profile.targetShorts ?? null,
        videoQuery: payload.profile.videoQuery ?? null,
        sortByViews: payload.profile.sortByViews,
        aiProvider: payload.profile.aiProvider,
        aiModel: payload.profile.aiModel,
      },
      focuses: payload.focuses.map((focus: z.infer<typeof focusSchema>) => ({ id: focus.id ?? randomUUID(), key: focus.key, label: focus.label })),
      sources: payload.sources.map((source: z.infer<typeof sourceSchema>) => ({ id: source.id ?? randomUUID(), kind: source.kind, value: source.value, label: source.label, createdAt: existing?.channel.createdAt ?? now })),
      publishingAccounts,
    });

    logger.info({ adminId, channelId, action: existing ? "update" : "create" }, "Channel updated");
    return c.json({ status: "ok" });
  });

  admin.delete("/channels/:channelId", async (c) => {
    const adminId = "system";
    const channelId = channelIdSchema.parse(c.req.param("channelId"));
    await repository.deleteBundle(channelId);
    logger.info({ adminId, channelId, action: "delete" }, "Channel updated");
    return c.json({ status: "deleted" });
  });

  admin.post("/channels/:channelId/test-connection", async (c) => {
    const adminId = "system";
    const channelId = channelIdSchema.parse(c.req.param("channelId"));
    try {
      const resolved = await resolver.resolveRunConfig(`test-${channelId}`, channelId);
      const oauth2Client = new google.auth.OAuth2(resolved.publishingAccount.clientId ?? "", resolved.publishingAccount.clientSecret ?? "");
      oauth2Client.setCredentials({ refresh_token: resolved.publishingAccount.token });
      await oauth2Client.getAccessToken();
      return c.json({ status: "ok" });
    } catch (error) {
      logger.warn({ adminId, channelId, provider: "youtube", error }, "Channel connection test failed");
      return c.json({ error: "Connection test failed" }, 400);
    }
  });
}

/* v8 ignore stop */
