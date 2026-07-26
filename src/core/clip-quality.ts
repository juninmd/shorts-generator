import { z } from "zod";
import type { PipelineConfig, Transcript } from "../types.js";
import { scheduleAbort } from "./abort-timeout.js";
import { createModel } from "./ai-provider.js";
import type { ClipItem } from "./analyzer-schema.js";
import { generateJsonObject } from "./generate-json.js";
import { logger } from "./logger.js";
import { scoreTextualImpact } from "./candidate-discovery.js";

const ReviewSchema = z.object({
  reviews: z.array(z.object({
    candidateIndex: z.number().int().nonnegative(),
    editorialScore: z.number().min(1).max(10),
    hookScore: z.number().min(1).max(10),
    standaloneScore: z.number().min(1).max(10),
    payoffScore: z.number().min(1).max(10),
    approved: z.boolean(),
    reason: z.string(),
  })),
});

type Review = z.infer<typeof ReviewSchema>["reviews"][number];

function candidateEvidence(clips: ClipItem[], transcript: Transcript): string {
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

function buildReviewPrompt(
  clips: ClipItem[],
  transcript: Transcript,
  minDuration: number,
  maxDuration: number,
): string {
  return `Você é o editor-chefe que aprova cortes antes da publicação. Faça uma revisão
independente: ignore a nota do primeiro editor e julgue somente a transcrição.

Esta é uma transcrição automática: ignore erros de transcrição, ortografia e
acentuação quando o sentido falado continuar claro. Não reduza notas por ruído
de ASR; reprove por incoerência somente quando a mensagem for incompreensível.

Reprove se qualquer critério ficar abaixo de 7:
- hookScore: a primeira frase prende em até 3 segundos, sem saudação ou introdução;
- standaloneScore: um desconhecido entende sem contexto anterior ou apoio visual;
- payoffScore: a última frase conclui a promessa; aforismo, transformação ou
  contraste final claro são payoff forte.

editorialScore mede o conjunto. approved só pode ser true quando os três critérios
forem >= 7 e editorialScore >= 7. Não aprove quantidade por quota. Use exatamente
o candidateIndex recebido e devolva uma revisão para cada candidato. Reprove
intervalos fora de ${minDuration}-${maxDuration}s ou frases truncadas.

FORMATO JSON EXATO:
{"reviews":[{"candidateIndex":0,"editorialScore":8,"hookScore":8,"standaloneScore":8,"payoffScore":8,"approved":true,"reason":"Justificativa editorial curta."}]}

${candidateEvidence(clips, transcript)}`;
}

function isApproved(review: Review, minimumScore: number): boolean {
  return review.approved
    && review.editorialScore >= minimumScore
    && review.hookScore >= 7
    && review.standaloneScore >= 7
    && review.payoffScore >= 7;
}

function hasStructuralProof(
  clip: ClipItem,
  transcript: Transcript,
  config: PipelineConfig,
): boolean {
  const duration = clip.endTime - clip.startTime;
  if (duration < config.minShortDuration || duration > config.maxShortDuration) return false;
  const segments = transcript.segments.filter(
    (segment) => segment.end > clip.startTime && segment.start < clip.endTime,
  );
  if (segments.length < 2 || !clip.hookText || !clip.payoffText) return false;
  const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();
  const literalBoundaries = normalize(clip.hookText) === normalize(segments[0]!.text)
    && normalize(clip.payoffText) === normalize(segments.at(-1)!.text);
  const completeEnding = /[.!?]$/.test(clip.payoffText.trim())
    && !clip.payoffText.trim().endsWith("...");
  return literalBoundaries && completeEnding
    && scoreTextualImpact(clip.hookText) >= 4
    && scoreTextualImpact(clip.payoffText) >= 2;
}

export async function reviewClipCandidates(
  clips: ClipItem[],
  transcript: Transcript,
  config: PipelineConfig,
): Promise<ClipItem[]> {
  if (clips.length === 0) return [];
  const controller = new AbortController();
  const timeoutId = scheduleAbort(controller, config.aiTimeoutMs ?? 300_000);
  try {
    const result = await generateJsonObject<z.infer<typeof ReviewSchema>>({
      model: createModel(config),
      schema: ReviewSchema,
      prompt: buildReviewPrompt(
        clips,
        transcript,
        config.minShortDuration,
        config.maxShortDuration,
      ),
      temperature: 0.2,
      maxRetries: 3,
      abortSignal: controller.signal,
    });
    const reviews = new Map(result.reviews.map((review) => [review.candidateIndex, review]));
    const minimumScore = Math.max(7, config.minViralScore ?? 7);
    return clips.flatMap((clip, index) => {
      const review = reviews.get(index);
      const structurallyProven = hasStructuralProof(clip, transcript, config);
      if (!review || (!isApproved(review, minimumScore) && !structurallyProven)) {
        logger.info({ title: clip.title, review }, "Clip rejected by editorial quality review");
        return [];
      }
      if (structurallyProven && !isApproved(review, minimumScore)) {
        logger.info({ title: clip.title }, "Clip accepted by structural editorial evidence");
      }
      return [{
        ...clip,
        viralScore: structurallyProven
          ? Math.max(8, clip.viralScore)
          : review.editorialScore,
        reason: structurallyProven
          ? "Gancho e payoff literais com estrutura retórica completa"
          : review.reason,
      }];
    }).sort((a, b) => b.viralScore - a.viralScore);
  } catch (error) {
    logger.error({ error }, "Editorial quality review unavailable; rejecting all candidates");
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}
