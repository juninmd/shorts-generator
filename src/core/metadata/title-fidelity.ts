import { normalizeText, words } from "../text-normalize.js";

const SPECULATION = /\b(acho|achamos|talvez|pode ser|possivelmente|provavelmente|suponho|parece que|dizem que|sera que|creio que|imagino|quem sabe|nao sei se|supostamente|teoria)\b/;
const CERTAINTY = /\b(confirmad\w*|comprovad\w*|provad\w*|confirma|comprova|prova que|e oficial|e fato|fato confirmado|revela a verdade|verdade revelada|finalmente descoberto)\b/;
const STOPWORDS = new Set(["sobre", "quando", "porque", "depois", "antes", "ainda", "sempre", "nunca", "muito", "voce", "nosso", "nossa", "essa", "esse", "isso", "aquilo", "todos", "todas", "coisa", "maior", "menor", "melhor", "verdade", "segredo", "ninguem", "ningue"]);

export interface FidelityResult {
  readonly ok: boolean;
  readonly reasons: string[];
}

/**
 * Heuristic fidelity check between a title and the clip transcript:
 * the title must share vocabulary with what is said, and must not assert as
 * fact something the speaker only speculates about.
 */
export function checkTitleFidelity(title: string, transcript: string, ignore: readonly string[] = []): FidelityResult {
  const reasons: string[] = [];
  const normalizedTitle = normalizeText(title);
  const normalizedTranscript = normalizeText(transcript);
  if (!normalizedTranscript) return { ok: true, reasons };
  if (CERTAINTY.test(normalizedTitle) && SPECULATION.test(normalizedTranscript)) {
    reasons.push("título afirma como fato algo tratado como especulação na fala");
  }
  const ignored = new Set(ignore.flatMap((name) => words(name)));
  const content = words(title).filter((w) => w.length >= 5 && !STOPWORDS.has(w) && !ignored.has(w));
  const stems = new Set(words(transcript).filter((w) => w.length >= 5).map((w) => w.slice(0, 5)));
  if (content.length >= 2 && !content.some((w) => stems.has(w.slice(0, 5)))) {
    reasons.push("título sem aderência ao conteúdo da transcrição");
  }
  return { ok: reasons.length === 0, reasons };
}
