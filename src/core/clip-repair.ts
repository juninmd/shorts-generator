import type { PipelineConfig, Transcript } from "../types.js";
import { scheduleAbort } from "./abort-timeout.js";
import { createModel } from "./ai-provider.js";
import { formatTranscriptForLLM } from "./analyzer-chunks.js";
import { ClipSchema, type ClipItem } from "./analyzer-schema.js";
import { generateJsonObject } from "./generate-json.js";
import { logger } from "./logger.js";

function failedCandidates(clips: ClipItem[]): string {
  return clips.map((clip, index) => [
    `CANDIDATO REPROVADO ${index}`,
    `Título: ${clip.title}`,
    `Intervalo: ${clip.startTime}-${clip.endTime} (${clip.endTime - clip.startTime}s)`,
    `Gancho alegado: ${clip.hookText ?? "ausente"}`,
    `Payoff alegado: ${clip.payoffText ?? "ausente"}`,
  ].join("\n")).join("\n\n");
}

function repairPrompt(
  clips: ClipItem[],
  transcript: Transcript,
  minDuration: number,
  maxDuration: number,
  maxClips: number,
): string {
  return `Você é um editor de resgate. Os candidatos abaixo foram reprovados por
gancho, contexto, payoff ou timestamps. Encontre momentos melhores na transcrição
completa. Não repita intervalos ruins; recorte apenas ideias autossuficientes.

REGRAS INEGOCIÁVEIS:
- Cada intervalo deve durar entre ${minDuration} e ${maxDuration} segundos
- startTime e endTime devem copiar limites existentes [início-fim]
- A primeira frase deve funcionar como gancho sem introdução
- A última frase deve concluir a ideia, nunca terminar truncada
- hookText e payoffText devem ser cópias literais dessas frases
- Varra especialmente o meio e o terço final
- Retorne no máximo ${maxClips} candidatos; zero é melhor que material mediano

JSON EXATO:
{"clips":[{"title":"...","presenter":"","description":"...","contentValue":"...","hookText":"primeira frase literal","payoffText":"última frase literal","startTime":0,"endTime":40,"viralScore":8,"reason":"...","hashtags":["#tema"]}]}

${failedCandidates(clips)}

TRANSCRIÇÃO COMPLETA:
${formatTranscriptForLLM(transcript.segments)}`;
}

export async function repairClipCandidates(
  clips: ClipItem[],
  transcript: Transcript,
  config: PipelineConfig,
  maxClips: number,
): Promise<ClipItem[]> {
  if (clips.length === 0) return [];
  const controller = new AbortController();
  const timeoutId = scheduleAbort(controller, config.aiTimeoutMs ?? 300_000);
  try {
    const result = await generateJsonObject<{ clips?: ClipItem[] }>({
      model: createModel(config),
      schema: ClipSchema,
      prompt: repairPrompt(
        clips,
        transcript,
        config.minShortDuration,
        config.maxShortDuration,
        maxClips,
      ),
      temperature: 0.4,
      maxRetries: 3,
      abortSignal: controller.signal,
    });
    return result.clips ?? [];
  } catch (error) {
    logger.error({ error }, "Clip boundary repair failed; publishing nothing");
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}
