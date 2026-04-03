
import { generateObject } from "ai";
import { nanoid } from "nanoid";
import type { Transcript, ShortClip, TranscriptSegment, TranscriptWord, PipelineConfig } from "../types.js";
import { logger } from "./logger.js";
import { snapToSentenceBoundaries } from "./clip-boundary.js";
import { getMinCuts, getMaxCuts } from "./config.js";
import { createModel } from "./ai-provider.js";
import { ClipSchema, type ClipItem } from "./analyzer-schema.js";
import { formatTranscriptForLLM, analyzeInChunks, CHUNK_THRESHOLD_CHARS } from "./analyzer-chunks.js";

export async function analyzeTranscript(
  transcript: Transcript,
  videoTitle: string,
  channelName: string,
  config: PipelineConfig,
): Promise<ShortClip[]> {
  const minCuts = config.maxClipsOverride ?? getMinCuts(transcript.duration);
  const maxCuts = config.maxClipsOverride ?? getMaxCuts(transcript.duration);
  const formatted = formatTranscriptForLLM(transcript.segments);

  logger.info(
    { videoId: transcript.videoId, minCuts, maxCuts, duration: transcript.duration, transcriptChars: formatted.length },
    "🧠 Analisando vídeo com AI Provider...",
  );

  const t0 = Date.now();
  const rawClips = formatted.length > CHUNK_THRESHOLD_CHARS
    ? await analyzeInChunks(transcript, videoTitle, channelName, config, minCuts, maxCuts, analyzeSinglePass)
    : await analyzeSinglePass(formatted, videoTitle, channelName, config, minCuts, maxCuts);

  logger.info({ videoId: transcript.videoId, rawClips: rawClips.length }, "Raw clips from LLM before filtering");

  const result = processClips(rawClips, transcript, config, maxCuts);

  logger.info(
    { videoId: transcript.videoId, clipsFound: result.length, elapsedSec: ((Date.now() - t0) / 1000).toFixed(1) },
    "✅ Análise concluída!",
  );

  return result;
}

// ─── Single-pass LLM call ────────────────────────────────────────────────────

export async function analyzeSinglePass(
  transcript: string,
  videoTitle: string,
  channelName: string,
  config: PipelineConfig,
  minCuts: number,
  maxCuts: number,
): Promise<ClipItem[]> {
  const prompt = buildAnalysisPrompt(
    transcript, videoTitle, channelName, minCuts, maxCuts,
    config.minShortDuration, config.maxShortDuration,
  );

  try {
    logger.debug({ model: config.aiModel, promptLength: prompt.length }, "Enviando prompt para AI Provider");

    const { object } = await generateObject({
      model: createModel(config),
      schema: ClipSchema,
      prompt,
      temperature: 0.6,
    });

    if (!object?.clips) return [];
    if (object.clips.length === 0) logger.info("AI retornou 0 cortes.");
    return object.clips;
  } catch (err) {
    logger.error({ err, errorMessage: (err as Error).message }, "Falha na chamada do LLM");
    return [];
  }
}

// ─── Prompt ──────────────────────────────────────────────────────────────────

function buildAnalysisPrompt(
  transcript: string,
  videoTitle: string,
  channelName: string,
  minClips: number,
  maxClips: number,
  minDuration: number,
  maxDuration: number,
): string {
  return `Você é um editor especializado em conteúdo espiritual e religioso para YouTube Shorts.
Sua missão: encontrar trechos que sejam "pílulas de conteúdo" — autocontidos, com sentido completo, sem depender do resto do vídeo.

VÍDEO: "${videoTitle}"
CANAL: "${channelName}"

PRIORIDADE — selecione por este tipo de conteúdo (nesta ordem):
1. Passagens bíblicas citadas E comentadas (inclua início e fim da citação)
2. Histórias ou parábolas com início, meio e fim claros
3. Ensinamentos morais que concluam um raciocínio completo
4. Momentos de oração com início e fim delimitados
5. Exemplos de vida de santos ou fatos históricos religiosos

OBRIGATÓRIO:
- O trecho DEVE começar em uma ideia nova (não no meio de uma frase)
- O trecho DEVE terminar com frase completa e conclusão
- Um espectador sem contexto DEVE entender tudo
- Duração: entre ${minDuration} e ${maxDuration} segundos
- Retornar no mínimo ${minClips} e no máximo ${Math.min(20, maxClips)} cortes

PROIBIDO — não selecione trechos que:
- Comecem com referências ao que foi dito antes ("como vimos", "voltando", "como mencionei")
- Referenciem gestos, slides ou "o que está na tela"
- Sejam interrompidos no meio de uma história ou argumento

PONTUAÇÃO viralScore (1–10):
- 9–10: Passagem bíblica delimitada OU história completa com moral clara
- 7–8: Ensinamento que conclui um raciocínio sem contexto externo
- 5–6: Reflexão interessante com contexto leve dispensável
- 1–4: Fragmento incompleto ou dependente de contexto

Títulos em Português (pt-BR), máx 50 caracteres, sem: "corte", "clipe", "short", "vídeo", "canal", "parte".

TRANSCRIÇÃO:
${transcript}`;
}

// ─── Post-processing ──────────────────────────────────────────────────────────

function processClips(clips: ClipItem[], transcript: Transcript, config: PipelineConfig, maxCuts: number): ShortClip[] {
  const filtered = clips.filter((clip) => {
    const duration = clip.endTime - clip.startTime;
    const ok = duration >= config.minShortDuration &&
               duration <= config.maxShortDuration &&
               clip.startTime >= 0 &&
               clip.endTime <= transcript.duration;
    if (!ok) {
      logger.info({
        title: clip.title,
        startTime: clip.startTime,
        endTime: clip.endTime,
        duration: duration.toFixed(1),
        minShortDuration: config.minShortDuration,
        maxShortDuration: config.maxShortDuration,
        transcriptDuration: transcript.duration,
      }, "Clip filtered out");
    }
    return ok;
  });
  logger.info({ total: clips.length, afterFilter: filtered.length }, "processClips filter result");
  return filtered
    .sort((a, b) => b.viralScore - a.viralScore)
    .slice(0, maxCuts)
    .map((clip) => {
      const snapped = snapToSentenceBoundaries({ startTime: clip.startTime, endTime: clip.endTime }, transcript.segments, config);
      return {
        id: nanoid(10),
        videoId: transcript.videoId,
        title: clip.title,
        description: clip.description,
        startTime: snapped.startTime,
        endTime: snapped.endTime,
        duration: snapped.endTime - snapped.startTime,
        viralScore: clip.viralScore,
        reason: clip.reason,
        transcript: getSegmentsInRange(transcript.segments, snapped.startTime, snapped.endTime),
        words: getWordsInRange(transcript.words, snapped.startTime, snapped.endTime),
        hashtags: clip.hashtags,
      };
    });
}

function getSegmentsInRange(segments: TranscriptSegment[], start: number, end: number): TranscriptSegment[] {
  return segments
    .filter((seg) => seg.start >= start - 0.5 && seg.end <= end + 0.5)
    .map((seg) => ({ start: Math.max(0, seg.start - start), end: seg.end - start, text: seg.text }));
}

function getWordsInRange(words: TranscriptWord[], start: number, end: number): TranscriptWord[] {
  return words
    .filter((w) => w.start >= start - 0.1 && w.end <= end + 0.1)
    .map((w) => ({ word: w.word, start: Math.max(0, w.start - start), end: w.end - start }));
}
