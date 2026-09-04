/* v8 ignore start */
import { google } from "googleapis";
import fs from "node:fs";
import type { PipelineConfig, YouTubeAuthConfig } from "../types.js";
import { logger } from "./logger.js";
import { withRetry } from "./retry-backoff.js";
import { isDailyLimitReachedAsync, setDailyLimitReachedAsync } from "./state.js";
import { notifyYoutubePublished, notifyYoutubeRateLimited } from "./telegram.js";
import { generateReauthUrl, sendReauthAlert } from "./youtube-reauth.js";
import { getYouTubeAuth, validateYouTubeToken } from "./youtube-auth.service.js";

interface YouTubeVideoInsertBody {
  snippet: { title: string; description: string; tags?: string[]; categoryId?: string };
  status?: { privacyStatus: string; selfDeclaredMadeForKids: boolean };
}

function createSanitizer(auth: YouTubeAuthConfig) {
  const secrets = [auth.clientId, auth.clientSecret, auth.refreshToken].filter(Boolean);
  return (msg: string) =>
    secrets.reduce((s, secret) => s.replace(new RegExp(secret, "g"), "***HIDDEN***"), msg);
}

async function performUpload(
  videoPath: string,
  requestBody: YouTubeVideoInsertBody,
  auth: YouTubeAuthConfig,
  config: PipelineConfig,
  logMessage: string,
  isShort?: boolean
): Promise<string | null> {
  const channelId = config.managedRun?.channelId || "global";
  if (await isDailyLimitReachedAsync(config.dailyUploadLimit, channelId)) {
    logger.warn({ limit: config.dailyUploadLimit, channelId }, "⚠️ Limite diário de uploads do YouTube atingido — abortando upload");
    return null;
  }

  const oauth2Client = new google.auth.OAuth2(auth.clientId, auth.clientSecret);
  oauth2Client.setCredentials({ refresh_token: auth.refreshToken });

  const youtube = google.youtube({ version: "v3", auth: oauth2Client });
  const sanitize = createSanitizer(auth);

  logger.info({
    videoPath, title: requestBody.snippet.title, runId: config.managedRun?.runId,
    channelId: config.managedRun?.channelId, accountId: config.managedRun?.accountId, destination: config.managedRun?.channelName,
  }, logMessage);

  try {
    const res = await withRetry(
      () => youtube.videos.insert({ part: ["snippet", "status"], requestBody, media: { body: fs.createReadStream(videoPath) } }),
      { maxAttempts: 3, baseDelayMs: 8000, logMessage: "YouTube upload failed, retrying..." }
    );

    const videoId = res.data?.id;
    const url = videoId ? (isShort ? `https://youtube.com/shorts/${videoId}` : `https://youtube.com/watch?v=${videoId}`) : null;

    if (url && videoId) {
      logger.info({ url }, "✅ Vídeo enviado com sucesso para o YouTube!");
      await notifyYoutubePublished({
        videoId, url, title: requestBody.snippet.title, channelName: config.managedRun?.channelName,
        isShort: !!isShort, tags: requestBody.snippet.tags, description: requestBody.snippet.description,
      }, config);
    }
    return url;
  } catch (error: any) {
    const errorMessage = sanitize(error?.message || String(error));
    if (errorMessage.includes("The user has exceeded the number of videos they may upload.")) {
      logger.warn({ channelId }, "⚠️ YouTube indicou que o limite diário de uploads foi atingido. Marcando limite atingido no estado.");
      const alreadyReached = await isDailyLimitReachedAsync(config.dailyUploadLimit, channelId);
      await setDailyLimitReachedAsync(channelId);
      if (!alreadyReached) {
        await notifyYoutubeRateLimited({ channelName: config.managedRun?.channelName, reason: "youtube-quota" }, config);
      }
    }
    const rawError = String(error?.message || error || "");
    if (rawError.includes("invalid_grant") && config.serverPublicUrl && config.managedRun?.channelId) {
      const reAuthUrl = generateReauthUrl(auth.clientId, auth.clientSecret, config.serverPublicUrl, config.managedRun.channelId);
      await sendReauthAlert(config.managedRun.channelId, config.managedRun.channelName ?? config.managedRun.channelId, reAuthUrl, config);
    }
    logger.error({ error: errorMessage }, "❌ Erro fatal no upload do YouTube após retries");
    return null;
  }
}

const limitTagsLength = (tags: unknown[], limit: number = 490): string[] => {
  const result: string[] = [];
  let currentLength = 0;
  for (const tag of tags) {
    if (typeof tag !== "string") continue;
    const cleanTag = tag.trim();
    if (!cleanTag) continue;
    const tagLength = cleanTag.length + (result.length > 0 ? 1 : 0);
    if (currentLength + tagLength > limit) break;
    result.push(cleanTag);
    currentLength += tagLength;
  }
  return result;
};

export const uploadToYouTube = async (videoPath: string, title: string, description: string, config: PipelineConfig, tags?: string[]): Promise<string | null> => {
  if (process.env.ENABLE_YOUTUBE !== "true") return null;

  const auth = await getYouTubeAuth(config);
  if (!auth) { logger.warn("⚠️ Credenciais do YouTube ausentes no .env. Pulando upload."); return null; }

  const validation = await validateYouTubeToken(config);
  if (!validation.valid) { logger.error({ error: validation.error }, "❌ Token do YouTube inválido - upload cancelado"); return null; }

  const uploadTags = limitTagsLength(tags && tags.length > 0 ? tags : [...config.managedRun?.focusLabels ?? [], "shorts"], 490);
  return performUpload(videoPath, { snippet: { title: title.slice(0, 100), description, tags: uploadTags, categoryId: "22" }, status: { privacyStatus: "public", selfDeclaredMadeForKids: false } }, auth, config, "🚀 Fazendo upload para o YouTube Shorts...", true);
};

export const uploadFullVideoToYouTube = async (videoPath: string, title: string, description: string, config: PipelineConfig, tags?: string[]): Promise<string | null> => {
  if (process.env.ENABLE_YOUTUBE !== "true") return null;

  const auth = await getYouTubeAuth(config);
  if (!auth) { logger.warn("⚠️ Credenciais do YouTube ausentes no .env. Pulando upload do vídeo completo."); return null; }

  const validation = await validateYouTubeToken(config);
  if (!validation.valid) { logger.error({ error: validation.error }, "❌ Token do YouTube inválido - upload cancelado"); return null; }

  const uploadTags = limitTagsLength(tags && tags.length > 0 ? tags : ["viral", "curiosidades", ...config.managedRun?.focusLabels ?? []], 490);
  return performUpload(videoPath, { snippet: { title: title.slice(0, 100), description, tags: uploadTags, categoryId: "22" }, status: { privacyStatus: "public", selfDeclaredMadeForKids: false } }, auth, config, "🚀 Fazendo upload do vídeo COMPLETO para o YouTube...", false);
};

/* v8 ignore stop */
