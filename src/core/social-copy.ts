import type { PlatformName, SocialCopy } from "./publishers/types.js";

export type TitleStyle = "catchy" | "curious" | "serious" | "question";

/** Title tone instructions for the metadata prompt (TITLE_STYLE=catchy|curious|serious|question). */
export const TITLE_STYLE_GUIDE: Record<TitleStyle, string> = {
  catchy: "chamativo e energético: números, contraste e uma promessa clara",
  curious: "gere curiosidade: revele que há algo surpreendente sem entregar o final",
  serious: "sóbrio e informativo: direto ao ponto, sem exageros nem clickbait",
  question: "formulado como uma pergunta instigante que o vídeo responde",
};

export function resolveTitleStyle(): TitleStyle | undefined {
  const style = process.env.TITLE_STYLE?.toLowerCase();
  return style && style in TITLE_STYLE_GUIDE ? style as TitleStyle : undefined;
}

interface Limits {
  caption: number;
  title: number;
  description: number;
  hashtags: number;
}

const LIMITS: Record<PlatformName, Limits> = {
  tiktok: { caption: 150, title: 90, description: 150, hashtags: 4 },
  instagram: { caption: 2200, title: 100, description: 2200, hashtags: 8 },
  threads: { caption: 500, title: 100, description: 500, hashtags: 1 },
  bluesky: { caption: 300, title: 100, description: 300, hashtags: 3 },
  pinterest: { caption: 500, title: 100, description: 500, hashtags: 5 },
};

/** Cuts at a word boundary and ends with an ellipsis when it had to shorten. */
export function truncateText(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = /\s/.test(text[max - 1]!) ? cut.length : cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

const toHashtag = (tag: string): string => `#${tag.replace(/^#/, "").replace(/[^\p{L}\p{N}_]/gu, "")}`;

export interface SocialMeta {
  title: string;
  description: string;
  tags: string[];
}

/** Platform-sized title, caption and description from the generated YouTube metadata. */
export function buildSocialCopy(platform: PlatformName, meta: SocialMeta): SocialCopy {
  const limits = LIMITS[platform];
  const hashtags = [...new Set(meta.tags.map(toHashtag).filter((tag) => tag.length > 1))].slice(0, limits.hashtags).join(" ");
  const body = meta.description.split("\n").map((line) => line.trim()).filter((line) => line && !/^(🎥|📱)/.test(line)).join("\n");
  const full = [meta.title, platform === "instagram" || platform === "pinterest" ? body : "", hashtags].filter(Boolean).join("\n\n");
  const room = Math.max(0, limits.caption - hashtags.length - 2);
  const caption = full.length <= limits.caption
    ? full
    : `${truncateText([meta.title, platform === "instagram" ? body : ""].filter(Boolean).join("\n\n"), room)}\n\n${hashtags}`.trim();
  return {
    title: truncateText(meta.title, limits.title),
    caption: truncateText(caption, limits.caption),
    description: truncateText(`${body}${hashtags ? `\n\n${hashtags}` : ""}`.trim() || meta.title, limits.description),
  };
}
