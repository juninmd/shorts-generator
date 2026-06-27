/* v8 ignore start */
import { Bot, InputFile } from "grammy";
import fs from "node:fs";
import type { GeneratedShort, PipelineConfig } from "../types.js";
import { logger } from "./logger.js";
import { withRetry } from "./retry-backoff.js";
import { buildPresenterTitle } from "./presenter-title.js";

function escapeHtml(text: string): string {
  if (!text) return "";
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * Build a short, human-friendly preview of the tags applied to a YouTube upload.
 * Caps the number shown so the Telegram message stays readable, and signals how
 * many extra tags were sent beyond the preview.
 */
function formatTagsPreview(tags: string[] | undefined, maxShown = 12): string {
  const clean = (tags || []).map((t) => (t ?? "").trim()).filter(Boolean);
  if (clean.length === 0) return "";
  const shown = clean.slice(0, maxShown);
  const rest = clean.length - shown.length;
  const list = shown.map((t) => escapeHtml(t)).join(", ");
  return rest > 0 ? `${list} <i>(+${rest})</i>` : list;
}

/**
 * Notify Telegram that a video was published to YouTube, with thumbnail + link.
 * Also surfaces the optimized title, a teaser from the description and the
 * search tags that were actually applied to the upload.
 */
export async function notifyYoutubePublished(
  params: {
    videoId: string;
    url: string;
    title: string;
    channelName?: string | null;
    isShort: boolean;
    tags?: string[];
    description?: string;
  },
  config: PipelineConfig,
): Promise<void> {
  if (!config.telegramBotToken || !config.telegramChatId) return;

  const bot = new Bot(config.telegramBotToken);
  const { videoId, url, title, channelName, isShort, tags, description } = params;

  const tagsPreview = formatTagsPreview(tags);
  // Teaser: first line/sentence of the description, before any hashtag/CTA block,
  // trimmed so the notification stays compact.
  const teaserRaw = (description || "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.startsWith("#") && !l.startsWith("🎥") && !l.startsWith("🔗")) || "";
  const teaser = teaserRaw.length > 180 ? `${teaserRaw.slice(0, 177)}...` : teaserRaw;

  // The YouTube thumbnail (i.ytimg.com) is often not generated yet immediately
  // after upload, so sendPhoto-by-URL fails with "wrong type of web page
  // content". Instead send a single message with the link preview ENABLED — the
  // YouTube card (with thumbnail) is rendered natively by Telegram once ready,
  // and one call per publish keeps us under the group rate limit.
  const text = [
    isShort ? `🎬 <b>SHORT PUBLICADO NO YOUTUBE</b>` : `🎬 <b>VÍDEO PUBLICADO NO YOUTUBE</b>`,
    `──────────────────────`,
    `📌 <b>${escapeHtml(title)}</b>`,
    channelName ? `📺 <b>Canal:</b> ${escapeHtml(channelName)}` : "",
    teaser ? `` : "",
    teaser ? `📝 <i>${escapeHtml(teaser)}</i>` : "",
    tagsPreview ? `` : "",
    tagsPreview ? `🏷 <b>Tags:</b> ${tagsPreview}` : "",
    ``,
    `🔗 <a href="${url}">${url}</a>`,
  ].filter(line => line !== "").join("\n");

  try {
    await withRetry(
      () => bot.api.sendMessage(config.telegramChatId, text, {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: false, url, prefer_large_media: true },
      }),
      { maxAttempts: 3, baseDelayMs: 2000, logMessage: "Telegram publish notification failed, retrying..." },
    );
    logger.info({ videoId, url }, "Sent YouTube publish notification to Telegram");
  } catch (e) {
    logger.error({ videoId, error: e instanceof Error ? e.message : String(e) }, "Failed to send YouTube publish notification");
  }
}

/**
 * Notify Telegram that YouTube uploads are paused for the day — either the
 * channel's configured daily cap was reached or YouTube itself rejected the
 * upload with its account rate limit. Backlog stays queued and resumes next day.
 */
export async function notifyYoutubeRateLimited(
  params: { channelName?: string | null; reason: "daily-cap" | "youtube-quota"; limit?: number },
  config: PipelineConfig,
): Promise<void> {
  if (!config.telegramBotToken || !config.telegramChatId) return;
  const bot = new Bot(config.telegramBotToken);
  const name = params.channelName || "Canal";
  const cause = params.reason === "youtube-quota"
    ? "O YouTube bloqueou novos uploads (limite de envios da conta atingido)."
    : `Limite diário de uploads atingido${params.limit ? ` (${params.limit})` : ""}.`;
  const message = [
    `⏸️ <b>UPLOADS DO YOUTUBE PAUSADOS</b>`,
    `──────────────────────`,
    `📺 <b>Canal:</b> ${escapeHtml(name)}`,
    ``,
    `${cause}`,
    `Os shorts restantes seguem na fila e serão publicados automaticamente quando a janela reabrir.`,
    `──────────────────────`,
  ].join("\n");
  try {
    await withRetry(
      () => bot.api.sendMessage(config.telegramChatId, message, { parse_mode: "HTML" }),
      { maxAttempts: 3, baseDelayMs: 2000, logMessage: "Telegram rate-limit alert failed, retrying..." },
    );
    logger.info({ channelName: name, reason: params.reason }, "Sent YouTube rate-limit alert to Telegram");
  } catch (e) {
    logger.error({ error: e instanceof Error ? e.message : String(e) }, "Failed to send YouTube rate-limit alert");
  }
}

/**
 * Notify Telegram that YouTube uploads resumed after a rate-limit pause.
 */
export async function notifyYoutubeResumed(
  channelName: string | null | undefined,
  config: PipelineConfig,
): Promise<void> {
  if (!config.telegramBotToken || !config.telegramChatId) return;
  const bot = new Bot(config.telegramBotToken);
  const message = [
    `▶️ <b>UPLOADS DO YOUTUBE RETOMADOS</b>`,
    `──────────────────────`,
    `📺 <b>Canal:</b> ${escapeHtml(channelName || "Canal")}`,
    ``,
    `O limite foi liberado e a fila voltou a publicar automaticamente.`,
    `──────────────────────`,
  ].join("\n");
  try {
    await withRetry(
      () => bot.api.sendMessage(config.telegramChatId, message, { parse_mode: "HTML" }),
      { maxAttempts: 3, baseDelayMs: 2000, logMessage: "Telegram resume alert failed, retrying..." },
    );
    logger.info({ channelName }, "Sent YouTube resume alert to Telegram");
  } catch (e) {
    logger.error({ error: e instanceof Error ? e.message : String(e) }, "Failed to send YouTube resume alert");
  }
}

/**
 * Send a full video to a Telegram channel (used by generate:top).
 */
export async function sendFullVideoToTelegram(
  video: import("../types.js").DownloadedVideo,
  config: PipelineConfig,
  youtubeOutputUrl?: string | null,
): Promise<number | undefined> {
  if (!config.telegramBotToken || !config.telegramChatId) {
    logger.warn("Telegram not configured, skipping upload");
    return undefined;
  }

  const bot = new Bot(config.telegramBotToken);

  const durationMin = Math.floor(video.duration / 60);
  const durationSec = Math.floor(video.duration % 60);
  const durationStr = `${durationMin}:${durationSec.toString().padStart(2, "0")}`;

  const caption = [
    `🎬 <b>VÍDEO COMPLETO</b>`,
    `──────────────────────`,
    `📌 <b>${escapeHtml(video.title)}</b>`,
    ``,
    `📺 <b>Canal:</b> ${escapeHtml(video.channelName)}`,
    `⏱ <b>Duração:</b> ${durationStr}`,
    `👁 <b>Visualizações:</b> ${video.viewCount ? video.viewCount.toLocaleString("pt-BR") : "N/A"}`,
    ``,
    youtubeOutputUrl ? `🔴 <b>Repost no YouTube:</b> <a href="${youtubeOutputUrl}">Assistir agora</a>` : "",
    `🔗 <b>Link Original:</b> <a href="${video.url}">Ver no YouTube</a>`,
    `──────────────────────`,
    `<i>Processado via Shorts Generator AI</i>`
  ].filter(line => line !== "").join("\n");

  try {
    const fileSize = fs.statSync(video.filePath).size;
    
    // Telegram limit: 50MB for bots
    if (fileSize > 50 * 1024 * 1024) {
      logger.warn(
        { videoId: video.id, sizeMB: (fileSize / 1024 / 1024).toFixed(1) },
        "Full video too large for Telegram, sending link instead",
      );
      const msg = await bot.api.sendMessage(config.telegramChatId, caption, {
        parse_mode: "HTML",
      });
      return msg.message_id;
    }

    const videoFile = new InputFile(video.filePath);
    const msg = await withRetry(
      () => bot.api.sendVideo(config.telegramChatId, videoFile, { caption, parse_mode: "HTML", supports_streaming: true }),
      { maxAttempts: 2, baseDelayMs: 1000, logMessage: "Telegram sendVideo failed, retrying..." },
    );

    logger.info(
      { videoId: video.id, messageId: msg.message_id },
      "Sent full video to Telegram",
    );

    return msg.message_id;
  } catch (error) {
    logger.error({ error, videoId: video.id }, "Failed to send full video to Telegram");
    return undefined;
  }
}

/**
 * Send a generated short to a Telegram channel.
 */
export async function sendToTelegram(
  short: GeneratedShort,
  config: PipelineConfig,
  youtubeUrl?: string | null,
  pendingRateLimit?: boolean,
): Promise<number | undefined> {
  if (!config.telegramBotToken || !config.telegramChatId) {
    logger.warn("Telegram not configured, skipping upload");
    return undefined;
  }

  const bot = new Bot(config.telegramBotToken);

  const startMin = Math.floor(short.clip.startTime / 60);
  const startSec = Math.floor(short.clip.startTime % 60);
  const endMin = Math.floor(short.clip.endTime / 60);
  const endSec = Math.floor(short.clip.endTime % 60);

  const timeRange = `${startMin}:${startSec.toString().padStart(2, "0")} - ${endMin}:${endSec.toString().padStart(2, "0")}`;

  const presenter = short.clip.presenter?.trim();
  const displayTitle = buildPresenterTitle(short.clip.title, presenter);

  const caption = [
    `✂️ <b>NOVO SHORT GERADO</b>`,
    `──────────────────────`,
    `🎬 <b>${escapeHtml(displayTitle)}</b>`,
    ``,
    presenter ? `🎤 <b>Apresentador:</b> ${escapeHtml(presenter)}` : "",
    `📺 <b>Canal:</b> ${escapeHtml(short.channelName)}`,
    `🎥 <b>Original:</b> ${escapeHtml(short.originalVideoTitle)}`,
    `⏱ <b>Corte:</b> <code>${timeRange}</code>`,
    `⭐ <b>Score Viral:</b> ${short.clip.viralScore}/10`,
    ``,
    `💡 <b>Insight:</b> <i>${escapeHtml(short.clip.reason)}</i>`,
    ``,
    youtubeUrl ? `🔴 <b>YouTube:</b> <a href="${youtubeUrl}">Assistir Short</a>` : "",
    pendingRateLimit ? `⏳ <b>Pendente:</b> já acumulado no PVC, aguardando a janela de publicação do YouTube (limite diário/rate limit). Será publicado automaticamente pela fila assim que a janela abrir.` : "",
    `🔗 <b>Original:</b> <a href="${short.originalVideoUrl}">Link</a>`,
    ``,
    `──────────────────────`,
    short.clip.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).map(escapeHtml).join(" "),
  ].filter(line => line !== "").join("\n");

  // Truncate caption if it exceeds Telegram's 1024 character limit for media
  const finalCaption = caption.length > 1000 ? caption.substring(0, 997) + "..." : caption;

  try {
    const fileSize = fs.statSync(short.outputPath).size;

    // Telegram limit: 50MB for bots
    if (fileSize > 50 * 1024 * 1024) {
      logger.warn(
        { clipId: short.id, sizeMB: (fileSize / 1024 / 1024).toFixed(1) },
        "Video too large for Telegram, sending link instead",
      );
      const msg = await bot.api.sendMessage(config.telegramChatId, finalCaption, {
        parse_mode: "HTML",
      });
      return msg.message_id;
    }

    const videoFile = new InputFile(short.outputPath);
    const msg = await withRetry(
      () => bot.api.sendVideo(config.telegramChatId, videoFile, { caption: finalCaption, parse_mode: "HTML", supports_streaming: true }),
      { maxAttempts: 2, baseDelayMs: 1000, logMessage: "Telegram sendVideo failed, retrying..." },
    );

    logger.info(
      { clipId: short.id, messageId: msg.message_id },
      "Sent to Telegram",
    );

    return msg.message_id;
  } catch (error) {
    logger.error({ error, clipId: short.id }, "Failed to send to Telegram");
    return undefined;
  }
}

/**
 * Send a fatal/unexpected error alert to Telegram.
 */
export async function sendErrorAlert(
  title: string,
  error: unknown,
  config: PipelineConfig,
): Promise<void> {
  if (!config.telegramBotToken || !config.telegramChatId) return;

  const bot = new Bot(config.telegramBotToken);
  const errStr = error instanceof Error
    ? `${error.message}${error.stack ? `\n\n<pre>${escapeHtml(error.stack.slice(0, 600))}</pre>` : ""}`
    : escapeHtml(String(error)).slice(0, 600);

  const message = [
    `🚨 <b>ERRO FATAL NA PIPELINE</b>`,
    `──────────────────────`,
    `📌 <b>Contexto:</b> ${escapeHtml(title)}`,
    ``,
    `❌ ${errStr}`,
    `──────────────────────`,
    `<i>${new Date().toLocaleString("pt-BR")}</i>`,
  ].join("\n");

  try {
    await bot.api.sendMessage(config.telegramChatId, message, { parse_mode: "HTML" });
  } catch (e) {
    logger.error({ e }, "Failed to send error alert to Telegram");
  }
}

/**
 * Send a summary message to Telegram after processing.
 */
export async function sendSummary(
  videoTitle: string,
  channelName: string,
  shortsCount: number,
  errors: string[],
  config: PipelineConfig,
): Promise<void> {
  if (!config.telegramBotToken || !config.telegramChatId) return;

  const bot = new Bot(config.telegramBotToken);

  const status = errors.length === 0 ? "✅ Sucesso" : "⚠️ Com erros";

  const message = [
    `📊 <b>RESUMO DO PROCESSAMENTO</b>`,
    `──────────────────────`,
    `Estado: ${status}`,
    `📺 <b>Canal:</b> ${escapeHtml(channelName)}`,
    `🎥 <b>Vídeo:</b> ${escapeHtml(videoTitle)}`,
    `✂️ <b>Shorts Gerados:</b> ${shortsCount}`,
    errors.length > 0 ? `❌ <b>Erros:</b> ${errors.length}` : "",
    errors.length > 0 ? "\n" + errors.slice(0, 5).map((e) => {
      const eStr = String(e);
      const truncated = eStr.length > 300 ? eStr.substring(0, 300) + "..." : eStr;
      return `• ${escapeHtml(truncated)}`;
    }).join("\n") + (errors.length > 5 ? `\n• ...e mais ${errors.length - 5} erros` : "") : "",
    `──────────────────────`,
    `<i>Pipeline concluído em ${new Date().toLocaleDateString('pt-BR')}</i>`
  ]
    .filter(Boolean)
    .join("\n");

  try {
    await bot.api.sendMessage(config.telegramChatId, message, {
      parse_mode: "HTML",
    });
  } catch (error) {
    logger.error({ error }, "Failed to send summary to Telegram");
  }
}
/* v8 ignore stop */
