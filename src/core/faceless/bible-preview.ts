import fs from "node:fs";
import { InputFile } from "grammy";
import type { PipelineConfig } from "../../types.js";
import { logger } from "../logger.js";
import { getBot } from "../telegram-bot.js";
import { escapeHtml, escapeHtmlWithin } from "../telegram-formatting.js";
import { addCommentToVideo, extractYouTubeVideoId } from "../youtube-comment.service.js";
import { uploadToYouTube } from "../youtube.service.js";
import type { BibleShortMeta } from "./bible-meta.js";

const CAPTION_MAX_CHARS = 1000;
const sidecarPath = (videoPath: string) => videoPath.replace(/\.mp4$/i, "") + ".publish.json";

/** Card de aprovação no Telegram: vídeo + título, referência e o comentário que será postado. */
export async function sendBiblePreview(meta: BibleShortMeta, config: PipelineConfig): Promise<string> {
  const file = sidecarPath(meta.videoPath);
  fs.writeFileSync(file, JSON.stringify(meta, null, 2));
  const bot = getBot(config);
  if (!bot) {
    logger.warn("Telegram não configurado — prévia salva só no sidecar");
    return file;
  }
  const head = [
    "📖 <b>PRÉVIA — aguardando aprovação</b>",
    "──────────────────────",
    `📌 <b>${escapeHtml(meta.title)}</b>`,
    `⏱ <b>Duração:</b> ${meta.durationSec.toFixed(0)}s`,
    "",
    "💬 <b>Comentário fixo:</b>",
  ].join("\n");
  const budget = CAPTION_MAX_CHARS - head.length - "\n<i></i>\n\n✅ Aprove para publicar no YouTube".length;
  const caption = `${head}\n<i>${escapeHtmlWithin(meta.commentText, budget)}</i>\n\n✅ Aprove para publicar no YouTube`;
  await bot.api.sendVideo(config.telegramChatId!, new InputFile(meta.videoPath), {
    caption, parse_mode: "HTML", supports_streaming: true,
  });
  return file;
}

/** Publica um preview aprovado: upload + comentário com os links. Retorna a URL do vídeo. */
export async function publishBiblePreview(metaFile: string, config: PipelineConfig): Promise<string> {
  const meta = JSON.parse(fs.readFileSync(metaFile, "utf8")) as BibleShortMeta;
  const url = await uploadToYouTube(meta.videoPath, meta.title, meta.description, config, meta.tags);
  if (!url) throw new Error("Upload falhou (retornou null)");
  const videoId = extractYouTubeVideoId(url);
  if (videoId) await addCommentToVideo(videoId, meta.commentText, config);
  return url;
}
