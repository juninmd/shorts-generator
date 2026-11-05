// YouTube rejects the whole upload ("invalid video keywords") when a single
// tag is longer than 30 characters or when the comma-joined list passes 500
// characters — both cases showed up in production with AI-generated tags
// (e.g. "como vencer batalhas espirituais", 32 chars).
export const YOUTUBE_TAG_MAX_LENGTH = 30;
export const YOUTUBE_TAGS_MAX_BYTES = 500;

// Keep only Latin letters (accents included), digits and the punctuation
// YouTube accepts inside a tag. CJK/emoji garbage from the LLM is dropped.
const INVALID_TAG_CHARS = /[^\p{Script=Latin}\p{M}\p{N} '&.\-]/gu;

function truncateTag(tag: string, max = YOUTUBE_TAG_MAX_LENGTH): string {
  if (tag.length <= max) return tag;
  const cut = tag.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trim();
}

/**
 * Normalizes a raw tag list into something YouTube accepts: valid characters
 * only, no duplicates, each tag at most 30 chars and the joined list at most
 * 500 bytes (UTF-8).
 */
export function sanitizeYoutubeTags(tags: unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  let totalBytes = 0;

  for (const raw of tags) {
    if (typeof raw !== "string") continue;
    const tag = truncateTag(raw.replace(INVALID_TAG_CHARS, " ").replace(/\s+/g, " ").trim());
    if (!tag) continue;

    const key = tag.toLowerCase();
    if (seen.has(key)) continue;

    const nextBytes = Buffer.byteLength(tag, "utf8") + (result.length > 0 ? 1 : 0);
    if (totalBytes + nextBytes > YOUTUBE_TAGS_MAX_BYTES) break;

    seen.add(key);
    result.push(tag);
    totalBytes += nextBytes;
  }

  return result;
}
