
import { getBot, sendTelegramMessage } from "./telegram-bot.js";
import { escapeHtml, formatTagsPreview } from "./telegram-formatting.js";
import { logger } from "./logger.js";
import type { PipelineConfig } from "../types.js";
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
  const { videoId, url, title, channelName, isShort, tags, description } = params;
  const tagsPreview = formatTagsPreview(tags);
  const teaserRaw = (description || "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.startsWith("#") && !l.startsWith("🎥") && !l.startsWith("🔗")) || "";
  const teaser = teaserRaw.length > 180 ? `${teaserRaw.slice(0, 177)}...` : teaserRaw;
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
    await sendTelegramMessage(config, text, {
      link_preview_options: { is_disabled: false, url, prefer_large_media: true },
    });
    logger.info({ videoId, url }, "Sent YouTube publish notification to Telegram");
  } catch (e) {
    logger.error({ videoId, error: String(e) }, "Failed to send YouTube publish notification");
  }
}
export async function notifyYoutubeRateLimited(
  params: { channelName?: string | null; reason: "daily-cap" | "youtube-quota"; limit?: number },
  config: PipelineConfig,
): Promise<void> {
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
    await sendTelegramMessage(config, message);
    logger.info({ channelName: name, reason: params.reason }, "Sent YouTube rate-limit alert to Telegram");
  } catch (e) {
    logger.error({ error: String(e) }, "Failed to send YouTube rate-limit alert");
  }
}
export async function notifyYoutubeResumed(
  channelName: string | null | undefined,
  config: PipelineConfig,
): Promise<void> {
  const message = [
    `▶️ <b>UPLOADS DO YOUTUBE RETOMADOS</b>`,
    `──────────────────────`,
    `📺 <b>Canal:</b> ${escapeHtml(channelName || "Canal")}`,
    ``,
    `O limite foi liberado e a fila voltou a publicar automaticamente.`,
    `──────────────────────`,
  ].join("\n");
  try {
    await sendTelegramMessage(config, message);
    logger.info({ channelName }, "Sent YouTube resume alert to Telegram");
  } catch (e) {
    logger.error({ error: String(e) }, "Failed to send YouTube resume alert");
  }
}
export async function sendErrorAlert(
  title: string,
  error: unknown,
  config: PipelineConfig,
): Promise<void> {
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
    await sendTelegramMessage(config, message);
  } catch (e) {
    logger.error({ e }, "Failed to send error alert to Telegram");
  }
}
export async function sendSummary(
  videoTitle: string,
  channelName: string,
  shortsCount: number,
  errors: string[],
  config: PipelineConfig,
): Promise<void> {
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
  ].filter(Boolean).join("\n");
  try {
    await sendTelegramMessage(config, message);
  } catch (error) {
    logger.error({ error }, "Failed to send summary to Telegram");
  }
}
