import { z } from "zod";
import type { Transcript } from "../types.js";
import type { ClipItem } from "./analyzer-schema.js";

export const ReviewSchema = z.object({
  reviews: z.array(z.object({
    candidateIndex: z.number().int().nonnegative(),
    editorialScore: z.number().min(1).max(10),
    hookScore: z.number().min(1).max(10),
    standaloneScore: z.number().min(1).max(10),
    payoffScore: z.number().min(1).max(10),
    approved: z.boolean(),
    themeAllowed: z.boolean().optional(),
    theme: z.string().optional(),
    reason: z.string(),
  })),
});

export type Review = z.infer<typeof ReviewSchema>["reviews"][number];

export function candidateEvidence(clips: ClipItem[], transcript: Transcript): string {
  return clips.map((clip, candidateIndex) => {
    const text = transcript.segments
      .filter((segment) => segment.end > clip.startTime && segment.start < clip.endTime)
      .map((segment) => `[${segment.start.toFixed(2)}-${segment.end.toFixed(2)}] ${segment.text}`)
      .join("\n");
    return `CANDIDATO ${candidateIndex}
Título: ${clip.title}
Intervalo: ${clip.startTime}-${clip.endTime} (${clip.endTime - clip.startTime}s)
Gancho literal: ${clip.hookText ?? "não informado"}
Payoff literal: ${clip.payoffText ?? "não informado"}
Nota do primeiro editor: ${clip.viralScore}
TRANSCRIÇÃO EXATA:
${text}`;
  }).join("\n\n");
}

const FORMAT = `FORMATO JSON EXATO:
{"reviews":[{"candidateIndex":0,"editorialScore":8,"hookScore":8,"standaloneScore":8,"payoffScore":8,"approved":true,"themeAllowed":true,"theme":"tema","reason":"Justificativa editorial curta."}]}`;

export function buildReviewPrompt(
  clips: ClipItem[],
  transcript: Transcript,
  minDuration: number,
  maxDuration: number,
  editorialBlock = "",
): string {
  return `Você é o editor-chefe que aprova cortes antes da publicação. Faça uma revisão
independente: ignore a nota do primeiro editor e julgue somente a transcrição.
${editorialBlock}
Esta é uma transcrição automática: ignore erros de transcrição, ortografia e
acentuação quando o sentido falado continuar claro. Não reduza notas por ruído
de ASR; reprove por incoerência somente quando a mensagem for incompreensível.

Reprove se qualquer critério ficar abaixo de 7:
- hookScore: a primeira frase prende em até 3 segundos, sem saudação ou introdução;
- standaloneScore: um desconhecido entende sem contexto anterior ou apoio visual;
- payoffScore: a última frase conclui a promessa; aforismo, transformação ou
  contraste final claro são payoff forte.

editorialScore mede o conjunto. approved só pode ser true quando os três critérios
forem >= 7 e editorialScore >= 7. themeAllowed indica se o tema respeita o perfil
editorial. Não aprove quantidade por quota. Use exatamente o candidateIndex recebido
e devolva uma revisão para cada candidato. Reprove intervalos fora de
${minDuration}-${maxDuration}s, frases truncadas ou cortes que distorcem o contexto da fala.

${FORMAT}

${candidateEvidence(clips, transcript)}`;
}

/** Second, stricter opinion used only when the heuristic and the first review diverge. */
export function buildReevaluationPrompt(
  clips: ClipItem[],
  transcript: Transcript,
  firstReviews: Review[],
  editorialBlock = "",
): string {
  const disputes = firstReviews.map((r, i) => `CANDIDATO ${i}: reprovado antes por "${r.reason}"`).join("\n");
  return `Você é um segundo editor-chefe. Os candidatos abaixo foram REPROVADOS por um
revisor, mas uma verificação estrutural encontrou gancho e conclusão literais.
Decida de forma independente, julgando contexto, gancho e conclusão. A heurística
estrutural é só evidência auxiliar: não aprove apenas por ela.
${editorialBlock}
${disputes}

${FORMAT}

${candidateEvidence(clips, transcript)}`;
}
