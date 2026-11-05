import { containsPhrase, normalizeText, words } from "../text-normalize.js";
import type { QuizQuestion } from "./quiz.domain.js";

export interface SourceEvidence {
  readonly url: string;
  readonly title: string;
  readonly excerpt: string;
}

export type AnchorResult =
  | { readonly verified: true; readonly source: SourceEvidence }
  | { readonly verified: false; readonly reason: string };

export type JsonFetcher = (url: string) => Promise<unknown>;

const WIKI = "https://pt.wikipedia.org";
const QUESTION_STOPWORDS = new Set(["qual", "quais", "quem", "quantos", "quantas", "onde", "quando", "sobre", "maior", "menor", "primeiro", "primeira"]);

export const defaultFetcher: JsonFetcher = async (url) => {
  const res = await fetch(url, {
    headers: { "User-Agent": "shorts-generator-quiz-check/1.0 (fact anchoring)", Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
};

function keywords(question: string): string[] {
  return words(question).filter((w) => w.length >= 5 && !QUESTION_STOPWORDS.has(w));
}

/**
 * Independent (non-LLM) anchoring: the correct option and most question keywords
 * must appear in a Wikipedia summary, and no competing option may appear there.
 * Heuristic evidence with provenance, not proof; anything else is held for review.
 */
export async function anchorQuestion(q: QuizQuestion, fetcher: JsonFetcher = defaultFetcher): Promise<AnchorResult> {
  const answer = q.opcoes[q.resposta_correta];
  const others = (Object.keys(q.opcoes) as (keyof QuizQuestion["opcoes"])[])
    .filter((k) => k !== q.resposta_correta).map((k) => q.opcoes[k]);
  const keys = keywords(q.pergunta);
  try {
    const search = await fetcher(`${WIKI}/w/rest.php/v1/search/page?q=${encodeURIComponent(`${answer} ${keys.join(" ")}`)}&limit=3`) as { pages?: { key: string; title: string }[] };
    for (const page of search.pages ?? []) {
      const summary = await fetcher(`${WIKI}/api/rest_v1/page/summary/${encodeURIComponent(page.key)}`) as { extract?: string; content_urls?: { desktop?: { page?: string } } };
      const extract = summary.extract ?? "";
      const text = `${page.title} ${extract}`;
      if (!containsPhrase(text, answer)) continue;
      const stems = new Set(words(text).map((w) => w.slice(0, 5)));
      const hits = keys.filter((k) => stems.has(k.slice(0, 5))).length;
      if (keys.length > 0 && hits / keys.length < 0.5) continue;
      if (others.some((o) => normalizeText(o).length > 2 && containsPhrase(extract, o))) continue;
      return {
        verified: true,
        source: { url: summary.content_urls?.desktop?.page ?? `${WIKI}/wiki/${encodeURIComponent(page.key)}`, title: page.title, excerpt: extract.slice(0, 500) },
      };
    }
    return { verified: false, reason: "nenhuma fonte confirmou a resposta sem ambiguidade" };
  } catch (error) {
    return { verified: false, reason: `fonte indisponível: ${error instanceof Error ? error.message : String(error)}` };
  }
}
