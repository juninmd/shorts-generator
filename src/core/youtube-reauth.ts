/* v8 ignore start */

import { google } from "googleapis";
import { Bot, InlineKeyboard } from "grammy";
import type { PipelineConfig } from "../types.js";
import { logger } from "./logger.js";

const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  // readonly lets the callback identify which YouTube channel was actually
  // authorized, so a wrong-account consent is caught instead of silently
  // uploading to the wrong channel.
  "https://www.googleapis.com/auth/youtube.readonly",
];
const OAUTH_CALLBACK_PATH = "/api/youtube/callback";

export function getOAuthCallbackUrl(serverPublicUrl: string): string {
  return `${serverPublicUrl}${OAUTH_CALLBACK_PATH}`;
}

export function generateReauthUrl(
  clientId: string,
  clientSecret: string,
  serverPublicUrl: string,
  channelId: string,
): string {
  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    getOAuthCallbackUrl(serverPublicUrl),
  );
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: YOUTUBE_SCOPES,
    prompt: "consent",
    state: channelId,
  });
}

export async function sendReauthAlert(
  channelId: string,
  channelName: string,
  authUrl: string,
  config: PipelineConfig,
): Promise<void> {
  if (!config.telegramBotToken || !config.telegramChatId) return;

  const bot = new Bot(config.telegramBotToken);
  const name = channelName || channelId;
  const message = [
    `🔑 <b>TOKEN YOUTUBE EXPIRADO</b>`,
    `──────────────────────`,
    `📺 <b>Canal:</b> ${name}`,
    ``,
    `Clique no botão abaixo para renovar o acesso:`,
    `──────────────────────`,
    `<i>${new Date().toLocaleString("pt-BR")}</i>`,
  ].join("\n");

  const keyboard = new InlineKeyboard().url("🔗 Autorizar YouTube", authUrl);

  try {
    await bot.api.sendMessage(config.telegramChatId, message, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: keyboard,
    });
    logger.info({ channelId }, "Reauth alert sent to Telegram");
  } catch (e) {
    logger.error({ e }, "Failed to send reauth alert to Telegram");
  }
}


/* v8 ignore stop */
