import type { Hono } from "hono";
import { google } from "googleapis";
import { logger } from "../core/logger.js";
import { channelIdSchema } from "./admin-schemas.js";
import type { AdminDeps } from "./admin-helpers.js";

function getYouTubeOAuth2Client(clientId: string, clientSecret: string, redirectUri: string) {
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Guarded route: the admin console calls it with the Bearer token to obtain a
 * fresh consent URL. The matching public callback lives in
 * admin-oauth-callback-routes.ts.
 */
export function registerYouTubeAuthUrlRoute(admin: Hono, deps: AdminDeps): void {
  const { repository } = deps;

  admin.get("/channels/:channelId/youtube/auth-url", async (c) => {
    const adminId = "system";
    const channelId = channelIdSchema.parse(c.req.param("channelId"));
    try {
      const bundle = await repository.getBundle(channelId);
      if (!bundle) {
        return c.json({ error: "Channel not found" }, 404);
      }
      const youtubeAccount = bundle.publishingAccounts.find((a) => a.provider === "youtube");
      if (!youtubeAccount || !youtubeAccount.clientId || !youtubeAccount.clientSecret) {
        return c.json({ error: "YouTube client credentials not configured" }, 400);
      }

      const redirectUri = c.req.query("redirect_uri") || process.env.YOUTUBE_OAUTH_REDIRECT_URI || `https://${c.req.header("host")}/api/admin/oauth/callback`;

      const oauth2Client = getYouTubeOAuth2Client(youtubeAccount.clientId, youtubeAccount.clientSecret, redirectUri);
      const scopes = [
        "https://www.googleapis.com/auth/youtube.upload",
        "https://www.googleapis.com/auth/youtube.readonly",
        "https://www.googleapis.com/auth/youtubepartner",
      ];

      const state = Buffer.from(JSON.stringify({ channelId, accountId: youtubeAccount.id, redirectUri })).toString("base64url");

      const authUrl = oauth2Client.generateAuthUrl({
        access_type: "offline",
        scope: scopes,
        state,
        prompt: "consent",
      });

      return c.json({ authUrl, state });
    } catch (error) {
      logger.error({ adminId, channelId, error }, "Failed to generate YouTube auth URL");
      return c.json({ error: "Failed to generate auth URL" }, 500);
    }
  });
}
