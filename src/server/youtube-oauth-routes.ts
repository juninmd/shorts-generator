/* v8 ignore start */
import { Hono } from "hono";
import { google } from "googleapis";
import { randomUUID } from "node:crypto";
import { Bot } from "grammy";
import { ChannelBundleRepository } from "../core/channel-bundle-repository.js";
import { createSecretStore } from "../core/secret-store.js";
import { tryLoadControlPlaneConfig } from "../core/control-plane-config.js";
import { getControlPlanePool } from "../core/control-plane-db.js";
import { getOAuthCallbackUrl } from "../core/youtube-reauth.js";
import { logger } from "../core/logger.js";

export function registerYoutubeOAuthRoutes(app: Hono): void {
  app.get("/api/youtube/callback", async (c) => {
    const code = c.req.query("code");
    const channelId = c.req.query("state");

    if (!code || !channelId) {
      return c.text("Missing code or state", 400);
    }

    const cpConfig = tryLoadControlPlaneConfig();
    if (!cpConfig) {
      logger.error("OAuth callback received but control plane not configured");
      return c.text("Control plane not configured", 500);
    }

    const clientId = process.env.YOUTUBE_CLIENT_ID;
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
    const serverPublicUrl = process.env.SERVER_PUBLIC_URL;

    if (!clientId || !clientSecret || !serverPublicUrl) {
      return c.text("Missing YouTube credentials or SERVER_PUBLIC_URL", 500);
    }

    try {
      const oauth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        getOAuthCallbackUrl(serverPublicUrl),
      );
      const { tokens } = await oauth2Client.getToken(code);

      if (!tokens.refresh_token) {
        return c.html(
          "<h1>❌ Token não gerado</h1><p>Revogue o acesso do app nas configurações da Conta Google e tente novamente.</p>",
        );
      }

      const db = getControlPlanePool(cpConfig);
      const repo = new ChannelBundleRepository(db);
      const secretStore = createSecretStore(cpConfig);
      const bundle = await repo.getBundle(channelId);

      if (!bundle) {
        return c.text(`Channel ${channelId} not found`, 404);
      }

      const now = new Date().toISOString();
      const existingAccount = bundle.publishingAccounts.find(a => a.provider === "youtube");
      const accountId = existingAccount?.id ?? randomUUID();
      const encryptedToken = secretStore.encryptToken(channelId, accountId, tokens.refresh_token);

      const updatedAccounts = existingAccount
        ? bundle.publishingAccounts.map(a =>
            a.provider === "youtube" ? { ...a, encryptedToken, updatedAt: now } : a,
          )
        : [
            ...bundle.publishingAccounts,
            {
              id: accountId, channelId, provider: "youtube" as const, label: "Principal",
              status: "active" as const, accountIdentifier: bundle.channel.name,
              clientId, clientSecret, encryptedToken, createdAt: now, updatedAt: now,
            },
          ];

      await repo.saveBundle({ ...bundle, publishingAccounts: updatedAccounts });

      logger.info({ channelId }, "YouTube token refreshed via OAuth callback");

      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = process.env.TELEGRAM_CHAT_ID;
      if (botToken && chatId) {
        const bot = new Bot(botToken);
        await bot.api.sendMessage(
          chatId,
          `✅ <b>Token YouTube atualizado!</b>\nCanal: <b>${bundle.channel.name}</b>`,
          { parse_mode: "HTML" },
        );
      }

      return c.html("<h1>✅ Token atualizado com sucesso!</h1><p>Você pode fechar esta aba.</p>");
    } catch (error) {
      logger.error({ error, channelId }, "Failed to exchange OAuth code");
      return c.text("Failed to exchange OAuth code", 500);
    }
  });
}
/* v8 ignore stop */
