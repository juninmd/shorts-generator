import { z } from "zod";
import type { Quiz, QuizQuestion } from "./quiz.domain.js";

/**
 * Independent answer-key audit. The model that wrote the quiz is asked again,
 * but this time blind: it sees the question and the four options, never the
 * declared answer, so its own answer can contradict the key. That contradiction
 * is the check — plus a factual verdict for the question itself.
 */

const LETTERS = ["A", "B", "C", "D"] as const;

export const quizAuditSchema = z.object({
  avaliacoes: z
    .array(
      z.object({
        /** 0-based, in the order the questions were listed. */
        indice: z.number().int().min(0),
        letra_correta: z.enum(LETTERS),
        confianca: z.enum(["alta", "media", "baixa"]),
        qualidade: z.enum(["ok", "ambigua", "incorreta"]),
        motivo: z.string().max(240).default(""),
      }),
    )
    .min(1),
});

export type QuizAudit = z.infer<typeof quizAuditSchema>;
export type AuditVerdict = QuizAudit["avaliacoes"][number];

export const QUIZ_AUDIT_SYSTEM = `Você é um revisor independente e rigoroso de quizzes para YouTube Shorts.
Você recebe perguntas com quatro opções e NÃO recebe a resposta declarada.
Regras:
1. RESOLVA cada pergunta por conta própria, como um especialista no tema.
2. letra_correta: a letra da opção que você considera correta.
3. confianca: "alta" quando o fato é verificável e a resposta é única; "media" quando há dúvida
   razoável; "baixa" quando você não tem certeza.
4. qualidade:
   - "ok": pergunta clara, uma única resposta correta, fato verificável.
   - "ambigua": duas ou mais opções defensáveis, enunciado impreciso, depende de opinião ou de
     interpretação.
   - "incorreta": o fato está errado, nenhuma opção responde à pergunta, ou a pergunta tem
     duas respostas certas.
5. motivo: uma frase curta explicando o veredito (vazia quando "ok").
6. Em dúvida factual, prefira "incorreta" a "ok". Não invente fatos.`;

/** Blind audit prompt: question + options only, declared answer deliberately omitted. */
export function buildAuditPrompt(quiz: Quiz): string {
  const blocks = quiz.perguntas.map((question, index) => {
    const options = LETTERS.map((letter) => `${letter}) ${question.opcoes[letter]}`).join("\n   ");
    return `${index}. ${question.pergunta}\n   ${options}`;
  });
  return [
    `Tema: ${quiz.tema}`,
    "Perguntas:",
    blocks.join("\n\n"),
    "",
    "Formato JSON exato:",
    '{"avaliacoes":[{"indice":0,"letra_correta":"B","confianca":"alta","qualidade":"ok","motivo":""}]}',
    "Avalie TODAS as perguntas, usando o índice 0-based na ordem acima.",
  ].join("\n");
}

export interface AuditOutcome {
  quiz: Quiz;
  /** 0-based indices removed so the caller can request replacements. */
  dropped: number[];
  notes: string[];
}

/**
 * Apply the audit: fix a wrong key when the auditor is sure, drop questions the
 * auditor judged wrong or ambiguous, and never leave fewer than two questions.
 */
export function applyAudit(quiz: Quiz, audit: QuizAudit): AuditOutcome {
  const verdicts = new Map<number, AuditVerdict>();
  for (const verdict of audit.avaliacoes) {
    if (verdict.indice < quiz.perguntas.length && !verdicts.has(verdict.indice)) {
      verdicts.set(verdict.indice, verdict);
    }
  }

  const dropped: number[] = [];
  const notes: string[] = [];
  const dropBudget = quiz.perguntas.length - 2;
  const perguntas: QuizQuestion[] = [];

  quiz.perguntas.forEach((question, index) => {
    const verdict = verdicts.get(index);
    if (!verdict) {
      perguntas.push(question);
      return;
    }
    const label = `pergunta ${index + 1}`;
    const shouldDrop = verdict.qualidade === "incorreta"
      || (verdict.qualidade === "ambigua" && verdict.confianca === "alta");
    if (shouldDrop && dropped.length < dropBudget) {
      dropped.push(index);
      notes.push(`descartada ${label} (${verdict.qualidade}${verdict.motivo ? `: ${verdict.motivo}` : ""})`);
      return;
    }
    if (shouldDrop) {
      notes.push(`${label} mantida apesar de "${verdict.qualidade}": não há perguntas suficientes`);
      perguntas.push(question);
      return;
    }
    if (verdict.confianca === "alta" && verdict.letra_correta !== question.resposta_correta) {
      notes.push(
        `gabarito corrigido na ${label}: ${question.resposta_correta} → ${verdict.letra_correta}`
        + `${verdict.motivo ? ` (${verdict.motivo})` : ""}`,
      );
      perguntas.push({ ...question, resposta_correta: verdict.letra_correta });
      return;
    }
    perguntas.push(question);
  });

  return { quiz: { ...quiz, perguntas }, dropped, notes };
}
