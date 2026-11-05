/** Lowercase, strip accents and punctuation, collapse whitespace. */
export function normalizeText(text: string): string {
  return (text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function words(text: string): string[] {
  const normalized = normalizeText(text);
  return normalized ? normalized.split(" ") : [];
}

/** True when the normalized phrase appears as whole words inside the normalized text. */
export function containsPhrase(text: string, phrase: string): boolean {
  const needle = normalizeText(phrase);
  if (!needle) return false;
  return ` ${normalizeText(text)} `.includes(` ${needle} `);
}

export function shingles(text: string, size = 3): Set<string> {
  const tokens = words(text);
  const result = new Set<string>();
  if (tokens.length < size) {
    if (tokens.length > 0) result.add(tokens.join(" "));
    return result;
  }
  for (let i = 0; i <= tokens.length - size; i++) result.add(tokens.slice(i, i + size).join(" "));
  return result;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection++;
  return intersection / (a.size + b.size - intersection);
}
