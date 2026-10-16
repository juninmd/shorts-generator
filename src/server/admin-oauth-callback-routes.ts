import type { Hono } from "hono";
import { google } from "googleapis";
import { logger } from "../core/logger.js";
import type { AdminDeps } from "./admin-helpers.js";

function getYouTubeOAuth2Client(clientId: string, clientSecret: string, redirectUri: string) {
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Public route. Google sends the browser here on redirect, with neither an
 * Authorization header nor an Origin, so it must NOT sit behind the admin auth
 * middleware — otherwise every consent ends on a 401/403 and the token is never
 * stored. Register it on the root app, not on the guarded admin sub-app.
 */
export function registerYouTubeOAuthCallbackRoute(app: Hono, deps: AdminDeps): void {
  const { repository, secretStore, resolver } = deps;

  app.get("/oauth/callback", async (c) => {
    const adminId = "system";
    const code = c.req.query("code");
    const state = c.req.query("state");
    const error = c.req.query("error");

    if (error) {
      logger.warn({ adminId, error }, "OAuth callback error");
      return c.text(`OAuth Error: ${error}`, 400);
    }

    if (!code || !state) {
      logger.warn({ adminId }, "OAuth callback missing code or state");
      return c.text("Missing code or state parameter", 400);
    }

    try {
      let stateData: { channelId: string; accountId: string; redirectUri: string };
      try {
        const decoded = Buffer.from(state, "base64url").toString("utf8");
        stateData = JSON.parse(decoded);
      } catch {
        logger.error({ adminId, state }, "Invalid state parameter");
        return c.text("Invalid state parameter", 400);
      }

      const { channelId, accountId, redirectUri } = stateData;

      const bundle = await repository.getBundle(channelId);
      if (!bundle) {
        return c.text("Channel not found", 404);
      }

      const youtubeAccount = bundle.publishingAccounts.find((a) => a.id === accountId && a.provider === "youtube");
      if (!youtubeAccount || !youtubeAccount.clientId || !youtubeAccount.clientSecret) {
        return c.text("YouTube account not found or missing credentials", 404);
      }

      const oauth2Client = getYouTubeOAuth2Client(youtubeAccount.clientId, youtubeAccount.clientSecret, redirectUri);
      const { tokens } = await oauth2Client.getToken(code);

      if (!tokens.refresh_token) {
        logger.warn({ adminId, channelId, accountId }, "No refresh token received - user may have already granted consent");
        return c.text("No refresh token received. Please revoke access in Google account settings and try again.", 400);
      }

      const encryptedToken = secretStore.encryptToken(channelId, accountId, tokens.refresh_token);

      await repository.updatePublishingAccount(accountId, {
        encryptedToken,
        clientId: youtubeAccount.clientId,
        clientSecret: youtubeAccount.clientSecret,
        updatedAt: new Date().toISOString(),
      });

      try {
        const resolved = await resolver.resolveRunConfig(`notify-${channelId}`, channelId);
        if (resolved.telegramAccount?.token && resolved.telegramAccount?.accountIdentifier) {
          const { Bot } = await import("grammy");
          const bot = new Bot(resolved.telegramAccount.token);
          const message = `✅ <b>Token do YouTube atualizado com sucesso!</b>\n\nCanal: ${resolved.channel.name}\nConta: ${youtubeAccount.label}\n\nAgora os uploads para o YouTube devem funcionar normalmente.`;
          await bot.api.sendMessage(resolved.telegramAccount.accountIdentifier, message, { parse_mode: "HTML" });
        }
      } catch (notifyError) {
        logger.warn({ error: notifyError }, "Failed to send Telegram notification");
      }

      return c.html(`
        <html>
          <head><title>YouTube Auth Success</title></head>
          <body style="font-family: sans-serif; text-align: center; padding: 50px;">
            <h1>✅ Autenticação Concluída!</h1>
            <p>O token do YouTube foi atualizado com sucesso.</p>
            <p>Canal: ${bundle.channel.name}</p>
            <p>Conta: ${youtubeAccount.label}</p>
            <p>Agora os uploads para o YouTube devem funcionar normalmente.</p>
            <script>setTimeout(() => window.close(), 3000);</script>
          </body>
        </html>
      `);
    } catch (err) {
      logger.error({ adminId, error: err }, "OAuth callback failed");
      return c.text(`Authentication failed: ${err instanceof Error ? err.message : String(err)}`, 500);
    }
  });
}
