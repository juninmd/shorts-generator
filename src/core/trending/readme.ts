import type { FetchLike } from "./github-trending.js";

export interface ReadmeImage {
  alt: string;
  url: string;
}

export interface ReadmeSection {
  heading: string;
  text: string;
  images: ReadmeImage[];
}

const RASTER_EXTENSIONS = /\.(png|jpe?g|gif|webp)(\?[^)\s"']*)?$/i;
const BADGE_HOSTS = /(img\.shields\.io|badge|shields\.io|codecov|github\.com\/.+\/workflows\/.+\/badge)/i;

export function rawReadmeUrl(fullName: string, branch: string): string {
  return `https://raw.githubusercontent.com/${fullName}/${branch}/README.md`;
}

/** Raw base that relative image paths in the README resolve against. */
export function rawBaseUrl(fullName: string, branch: string): string {
  return `https://raw.githubusercontent.com/${fullName}/${branch}/`;
}

export async function fetchReadme(
  fullName: string,
  branch: string,
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  const response = await fetchImpl(rawReadmeUrl(fullName, branch));
  if (!response.ok) throw new Error(`README not found for ${fullName}: HTTP ${response.status}`);
  return response.text();
}

function resolveImageUrl(src: string, base: string): string | null {
  try {
    const url = new URL(src, base);
    if (url.protocol !== "https:") return null;
    if (!RASTER_EXTENSIONS.test(url.pathname) || BADGE_HOSTS.test(url.href)) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** Image references in a line, markdown `![alt](src)` and HTML `<img>`, with badges and SVGs dropped. */
export function extractImages(line: string, base: string): ReadmeImage[] {
  const found: ReadmeImage[] = [];
  const add = (alt: string, src: string) => {
    const url = resolveImageUrl(src.trim(), base);
    if (url) found.push({ alt: alt.trim(), url });
  };
  for (const match of line.matchAll(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    add(match[1]!, match[2]!);
  }
  for (const match of line.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    const src = /\bsrc="([^"]+)"/i.exec(tag)?.[1];
    const alt = /\balt="([^"]*)"/i.exec(tag)?.[1] ?? "";
    if (src) add(alt, src);
  }
  return found;
}

/** Plain text of a line: images, HTML tags and link syntax removed. */
export function plainText(line: string): string {
  return line
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isProse(line: string): boolean {
  return line.length > 0 && !line.startsWith("|") && !line.startsWith("```");
}

/** Splits a README into sections by heading, keeping prose and the images inside each. */
export function parseReadme(markdown: string, base: string): ReadmeSection[] {
  const sections: ReadmeSection[] = [];
  let current: ReadmeSection = { heading: "", text: "", images: [] };
  let inCode = false;
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("```")) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      if (current.heading || current.text || current.images.length) sections.push(current);
      current = { heading: plainText(heading[1]!), text: "", images: [] };
      continue;
    }
    current.images.push(...extractImages(line, base));
    const text = plainText(line);
    if (isProse(line) && text) current.text = `${current.text} ${text}`.trim();
  }
  if (current.heading || current.text || current.images.length) sections.push(current);
  return sections;
}

const NON_LATIN_LETTER = /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u;

/**
 * True when the README prose is mostly Latin script. The narration voice is
 * Portuguese, so a CJK README would be read aloud as gibberish; those are skipped.
 */
export function isMostlyLatin(sections: ReadmeSection[]): boolean {
  const letters = sections.map((section) => section.text).join(" ").match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return true;
  const nonLatin = letters.filter((letter) => NON_LATIN_LETTER.test(letter)).length;
  return nonLatin / letters.length < 0.05;
}
