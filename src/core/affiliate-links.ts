import { YOUTUBE_DESCRIPTION_MAX_BYTES } from "./youtube-snippet.js";

export interface AffiliateLink {
  readonly name: string;
  readonly url: string;
}

export const AFFILIATE_PER_COMMENT = 2;
export const AMAZON_DISCLOSURE = "Como Associado da Amazon, eu ganho com compras qualificadas.";

const hashSeed = (seed: string): number => {
  let h = 0;
  for (const ch of seed) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
  return h;
};

/** Escolhe até `count` links distintos; o mesmo `seed` (id do vídeo) sempre dá os mesmos. */
export const pickAffiliateLinks = (
  links: readonly AffiliateLink[],
  seed: string,
  count = AFFILIATE_PER_COMMENT,
): AffiliateLink[] => {
  const size = Math.min(count, links.length);
  const start = links.length ? hashSeed(seed) % links.length : 0;
  return Array.from({ length: size }, (_, i) => links[(start + i) % links.length]!);
};

export const buildAffiliateBlock = (
  links: readonly AffiliateLink[] | undefined,
  seed: string,
  heading: string,
): string => {
  const picked = pickAffiliateLinks(links ?? [], seed);
  if (!picked.length) return "";
  const lines = picked.map((l) => `• ${l.name} → ${l.url}`);
  return `🛒 ${heading}\n${lines.join("\n")}\n\n${AMAZON_DISCLOSURE}`;
};

const RELIGIOUS_FOCUS = /cat[óo]lic|gospel|crist[ãa]?o|f[ée]|igreja|ora[çc][ãa]o|b[íi]blia/i;

export const isReligiousFocus = (focusLabels?: readonly string[]): boolean =>
  (focusLabels ?? []).some((l) => RELIGIOUS_FOCUS.test(l));

export const affiliateHeading = (focusLabels?: readonly string[]): string =>
  isReligiousFocus(focusLabels) ? "Para sua caminhada de fé:" : "Achados que a gente curte:";

/** Anexa o bloco ao fim da descrição, cortando o corpo (não o bloco) se passar de 5000 bytes. */
export const appendAffiliateBlock = (
  description: string,
  links: readonly AffiliateLink[] | undefined,
  seed: string,
  focusLabels?: readonly string[],
): string => {
  const block = buildAffiliateBlock(links, seed, affiliateHeading(focusLabels));
  if (!block) return description;
  const room = YOUTUBE_DESCRIPTION_MAX_BYTES - Buffer.byteLength(`

${block}`, "utf8");
  let bytes = 0;
  let body = "";
  for (const char of description.trimEnd()) {
    bytes += Buffer.byteLength(char, "utf8");
    if (bytes > room) break;
    body += char;
  }
  return `${body.trimEnd()}

${block}`;
};
