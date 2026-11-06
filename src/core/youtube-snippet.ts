/**
 * YouTube Data API snippet limits: a title of 1–100 characters and a
 * description of at most 5000 bytes, neither containing "<" or ">"
 * (the upload fails with invalidTitle/invalidDescription otherwise).
 */
export const YOUTUBE_TITLE_MAX_CHARS = 100;
export const YOUTUBE_DESCRIPTION_MAX_BYTES = 5000;
const FALLBACK_TITLE = "Shorts";

/** "<" and ">" become look-alike guillemets so "<3" or "a > b" keep reading the same. */
function replaceAngleBrackets(text: string): string {
  return text.replace(/</g, "‹").replace(/>/g, "›");
}

/**
 * Upload-safe title: one line, no angle brackets, at most 100 characters
 * counted by code point (an emoji is never split in half), cut at a word
 * boundary with an ellipsis instead of mid-word.
 */
export function sanitizeYoutubeTitle(title: string): string {
  const clean = replaceAngleBrackets(title).replace(/\s+/g, " ").trim();
  const chars = Array.from(clean);
  if (chars.length === 0) return FALLBACK_TITLE;
  if (chars.length <= YOUTUBE_TITLE_MAX_CHARS) return clean;
  const head = chars.slice(0, YOUTUBE_TITLE_MAX_CHARS - 1).join("");
  const lastSpace = head.lastIndexOf(" ");
  const cut = lastSpace >= head.length * 0.6 ? head.slice(0, lastSpace) : head;
  return `${cut.replace(/[\s,;:.\-–—]+$/u, "")}…`;
}

/** Upload-safe description: no angle brackets, at most 5000 UTF-8 bytes, cut on a code point. */
export function sanitizeYoutubeDescription(description: string): string {
  const clean = replaceAngleBrackets(description);
  if (Buffer.byteLength(clean, "utf8") <= YOUTUBE_DESCRIPTION_MAX_BYTES) return clean;
  let bytes = 0;
  let out = "";
  for (const char of clean) {
    bytes += Buffer.byteLength(char, "utf8");
    if (bytes > YOUTUBE_DESCRIPTION_MAX_BYTES) break;
    out += char;
  }
  return out;
}
