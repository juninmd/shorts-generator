import type { PipelineConfig } from "../../types.js";
import { getOptionalPool } from "../control-plane-db.js";
import { checkEditorialAdherence, checkFormatAllowed } from "../editorial/editorial-gate.js";
import { DEFAULT_EDITORIAL_PROFILE } from "../editorial/editorial-profile.js";
import { logger } from "../logger.js";
import { generateQuiz, pickQuizTopic } from "./quiz-content.service.js";
import { anchorQuestion, type AnchorResult } from "./quiz-fact-check.js";
import { QuizBankRepository } from "./quiz-bank-repository.js";
import { questionHash, quizSchema, type Quiz, type QuizQuestion } from "./quiz.domain.js";

export type PreparedQuiz =
  | { readonly status: "ready"; readonly quiz: Quiz; readonly hashes: string[]; readonly provenance: string[] }
  | { readonly status: "held"; readonly reasons: string[]; readonly quiz?: Quiz };

export interface QuizSourcingDeps {
  readonly generate?: typeof generateQuiz;
  readonly anchor?: (q: QuizQuestion) => Promise<AnchorResult>;
  readonly bank?: QuizBankRepository | null;
  readonly maxAttempts?: number;
}

/** Schema-valid, non-repeated, source-anchored (or human-reviewed) quiz — or a held result. */
export async function prepareVerifiedQuiz(config: PipelineConfig, customTopic?: string, deps: QuizSourcingDeps = {}): Promise<PreparedQuiz> {
  const profile = config.managedRun?.editorial ?? DEFAULT_EDITORIAL_PROFILE;
  const format = checkFormatAllowed("quiz", profile);
  if (!format.ok) return { status: "held", reasons: format.reasons };
  const channelId = config.managedRun?.channelId ?? "global";
  const pool = deps.bank === undefined ? getOptionalPool() : null;
  const bank = deps.bank === undefined ? (pool ? new QuizBankRepository(pool) : null) : deps.bank;
  if (!bank) logger.warn("Quiz sem banco de dados: histórico de repetição não pode ser aplicado");
  const used = bank ? await bank.recentlyUsed(channelId) : new Set<string>();
  const topic = pickQuizTopic(config, customTopic);
  const reasons: string[] = [];
  let lastQuiz: Quiz | undefined;

  for (let attempt = 1; attempt <= (deps.maxAttempts ?? 2); attempt++) {
    let quiz: Quiz;
    try {
      quiz = quizSchema.parse(await (deps.generate ?? generateQuiz)(config, topic, [...used]));
    } catch (error) {
      reasons.push(`tentativa ${attempt}: ${error instanceof Error ? error.message.slice(0, 300) : String(error)}`);
      continue;
    }
    lastQuiz = quiz;
    const adherence = checkEditorialAdherence(`${quiz.tema} ${quiz.titulo_youtube} ${quiz.perguntas.map((q) => q.pergunta).join(" ")}`, profile, true);
    if (!adherence.ok) { reasons.push(...adherence.reasons); continue; }
    const repeated = quiz.perguntas.filter((q) => used.has(questionHash(q)));
    if (repeated.length) { reasons.push(`perguntas usadas recentemente: ${repeated.map((q) => q.pergunta).join(" | ")}`); continue; }

    const provenance: string[] = [];
    const unverified: string[] = [];
    for (const q of quiz.perguntas) {
      const known = bank ? await bank.findByHash(questionHash(q)) : null;
      if (known?.status === "approved" && known.question.resposta_correta === q.resposta_correta
        && known.question.opcoes[q.resposta_correta] === q.opcoes[q.resposta_correta]) {
        provenance.push(`${q.pergunta} <- banco (${known.verifiedBy})`);
        continue;
      }
      const anchored = await (deps.anchor ?? anchorQuestion)(q);
      if (anchored.verified) {
        await bank?.upsert(quiz.tema, q, "approved", "wikipedia_anchor", anchored.source);
        provenance.push(`${q.pergunta} <- ${anchored.source.url}`);
      } else {
        await bank?.upsert(quiz.tema, q, "pending_review", "unverified", null);
        unverified.push(`${q.pergunta}: ${anchored.reason}`);
      }
    }
    if (unverified.length) { reasons.push(...unverified); continue; }
    const hashes = quiz.perguntas.map(questionHash);
    await bank?.markUsed(channelId, hashes);
    return { status: "ready", quiz, hashes, provenance };
  }
  return { status: "held", reasons, quiz: lastQuiz };
}
