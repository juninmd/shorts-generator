import type { PipelineConfig, VideoInfo } from "../types.js";

// Channel-derived keyword tags: full channel name plus adjacent word-pairs
// (handles "Nome Sobrenome Extra" → full + first-two + last-two). Lowercased,
// with separator punctuation stripped so YouTube search matches cleanly.
function deriveChannelTags(channelName: string): string[] {
  const name = channelName.replace(/[|•·\-–—]+/g, " ").replace(/\s+/g, " ").trim();
  if (!name) return [];
  const words = name.split(" ").filter(Boolean);
  const tags = [name.toLowerCase()];
  if (words.length >= 2) {
    tags.push(`${words[0]} ${words[1]}`.toLowerCase());
    tags.push(`${words[words.length - 2]} ${words[words.length - 1]}`.toLowerCase());
  }
  return tags;
}

/**
 * Engaging, well-formatted description for a full-video repost: teaser, CTA,
 * original link and a hashtag block built from the channel name.
 */
export function buildFullVideoDescription(video: VideoInfo): string {
  const tag = video.channelName.replace(/[^\p{L}\p{N}]/gu, "");
  const firstWord = video.channelName.split(" ")[0]?.replace(/[^\p{L}\p{N}]/gu, "") || "";
  return [
    `🎬 ${video.title}`,
    ``,
    `Confira na íntegra este conteúdo do canal ${video.channelName}.`,
    ``,
    `👉 Inscreva-se e ative o sininho para não perder nada! Deixe seu like 👍 e comente o que achou.`,
    ``,
    `🎥 Vídeo original completo: ${video.url}`,
    ``,
    `#shorts #viral${tag ? ` #${tag}` : ""}${firstWord && firstWord !== tag ? ` #${firstWord}` : ""}`,
  ].join("\n");
}

/**
 * Search tags for a full-video repost: channel name + word-pairs + broad terms.
 */
export function buildFullVideoTags(video: VideoInfo, config: PipelineConfig): string[] {
  return [
    ...deriveChannelTags(video.channelName),
    ...(config.managedRun?.focusLabels || []),
    "viral",
    "curiosidades",
    "melhores momentos",
  ];
}
