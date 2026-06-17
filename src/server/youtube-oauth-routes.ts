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

      // Identify the actual YouTube channel that was authorized, so a consent
      // with the wrong Google account/brand channel is caught instead of
      // silently uploading to the wrong channel.
      let authorizedChannelTitle = "";
      let authorizedChannelId = "";
      try {
        oauth2Client.setCredentials(tokens);
        const yt = google.youtube({ version: "v3", auth: oauth2Client });
        const me = await yt.channels.list({ mine: true, part: ["snippet"] } as any);
        const ch = me.data.items?.[0];
        authorizedChannelTitle = ch?.snippet?.title ?? "";
        authorizedChannelId = ch?.id ?? "";
      } catch (e) {
        logger.warn({ channelId, error: e instanceof Error ? e.message : String(e) }, "Could not read authorized YouTube channel identity");
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

      const identifier = authorizedChannelTitle || bundle.channel.name;
      const updatedAccounts = existingAccount
        ? bundle.publishingAccounts.map(a =>
            a.provider === "youtube" ? { ...a, encryptedToken, accountIdentifier: identifier, updatedAt: now } : a,
          )
        : [
            ...bundle.publishingAccounts,
            {
              id: accountId, channelId, provider: "youtube" as const, label: "Principal",
              status: "active" as const, accountIdentifier: identifier,
              clientId, clientSecret, encryptedToken, createdAt: now, updatedAt: now,
            },
          ];

      await repo.saveBundle({ ...bundle, publishingAccounts: updatedAccounts });

      logger.info({ channelId, authorizedChannelTitle, authorizedChannelId }, "YouTube token refreshed via OAuth callback");

      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = process.env.TELEGRAM_CHAT_ID;
      if (botToken && chatId) {
        const bot = new Bot(botToken);
        const linked = authorizedChannelTitle
          ? `📺 <b>Conta YouTube vinculada:</b> ${authorizedChannelTitle}`
          : `⚠️ Não foi possível ler o canal autorizado (verifique manualmente).`;
        await bot.api.sendMessage(
          chatId,
          `✅ <b>Token YouTube atualizado!</b>\nCanal interno: <b>${bundle.channel.name}</b>\n${linked}\n\n<i>⚠️ Se a conta vinculada acima não for a esperada, refaça a autorização e escolha o canal correto na tela do Google.</i>`,
          { parse_mode: "HTML" },
        );
      }

      const warn = authorizedChannelTitle
        ? `<p>Conta YouTube vinculada: <b>${authorizedChannelTitle}</b></p><p>Se não for o canal esperado, refaça e escolha a conta correta no Google.</p>`
        : "";
      return c.html(`<h1>✅ Token atualizado com sucesso!</h1>${warn}<p>Você pode fechar esta aba.</p>`);
    } catch (error) {
      logger.error({ error, channelId }, "Failed to exchange OAuth code");
      return c.text("Failed to exchange OAuth code", 500);
    }
  });
}
/* v8 ignore stop */
