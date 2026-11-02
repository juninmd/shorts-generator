import type { VideoInfo } from "../types.js";

const MAX_DESCRIPTION_CHARS = 600;

/** Compact context block (title, channel, date, trimmed description) handed to the reviewer. */
export function buildSourceBrief(video: Pick<VideoInfo, "title" | "channelName" | "publishedAt" | "description">): string {
  const description = (video.description ?? "").replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
  const lines = [
    `CONTEXTO DA FONTE: vídeo "${video.title}" do canal "${video.channelName}"`
      + (video.publishedAt ? ` (publicado em ${video.publishedAt})` : "") + ".",
  ];
  if (description) lines.push(`Descrição: ${description.slice(0, MAX_DESCRIPTION_CHARS)}`);
  lines.push("Use este contexto só para entender assunto e nomes; julgue o corte pela transcrição.");
  return `${lines.join("\n")}\n`;
}
