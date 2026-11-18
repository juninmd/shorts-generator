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
