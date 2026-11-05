import { words } from "../text-normalize.js";

export type DetectedLanguage = "pt" | "en" | "es" | "unknown";

// Distinctive function words (accent-stripped); shared words like "que"/"de" are left out on purpose.
const MARKERS: Record<Exclude<DetectedLanguage, "unknown">, Set<string>> = {
  pt: new Set(["nao", "voce", "voces", "e", "sao", "isso", "uma", "um", "do", "da", "dos", "das", "ao", "os", "as", "com", "mais", "ele", "ela", "seu", "sua", "tambem", "quando", "ninguem", "coracao", "deus", "nos", "na", "pra", "esse", "essa", "ate", "foi", "tem", "vai", "sobre", "muito", "voce", "sem", "como", "qual", "quem", "fe"]),
  en: new Set(["the", "and", "you", "is", "are", "of", "to", "with", "this", "that", "what", "how", "why", "your", "it", "in", "on", "was", "who", "will", "never", "about", "from", "god", "he", "she", "they", "my"]),
  es: new Set(["el", "los", "las", "y", "con", "una", "del", "pero", "muy", "esto", "hay", "nadie", "tambien", "corazon", "dios", "usted", "ustedes", "su", "sus", "lo", "al", "fue", "tiene", "va", "sobre", "mucho", "sin", "como", "cual", "quien"]),
};

export function detectLanguage(text: string): DetectedLanguage {
  const scores = { pt: 0, en: 0, es: 0 };
  if (/[ãõç]/i.test(text)) scores.pt += 2;
  if (/[ñ¿¡]/i.test(text)) scores.es += 2;
  for (const token of words(text)) {
    for (const lang of ["pt", "en", "es"] as const) if (MARKERS[lang].has(token)) scores[lang]++;
  }
  const ranked = (Object.entries(scores) as [DetectedLanguage, number][]).sort((a, b) => b[1] - a[1]);
  const [best, second] = ranked;
  if (!best || best[1] === 0 || best[1] === second?.[1]) return "unknown";
  return best[0];
}

/**
 * A text only fails when it is positively identified as another language;
 * short titles without markers ("Padre Pio: milagre!") are not rejected.
 */
export function matchesLanguage(text: string, expected: string): boolean {
  const base = expected.slice(0, 2).toLowerCase();
  const detected = detectLanguage(text);
  return detected === "unknown" || detected === base;
}
