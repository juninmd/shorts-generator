
import { generateText } from "ai";
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
  const forceFallback = process.env.FORCE_FALLBACK_CLIPS === "true";

  logger.info(
    { videoId: transcript.videoId, minCuts, maxCuts, duration: transcript.duration, transcriptChars: formatted.length },
    "🧠 Analisando vídeo com AI Provider...",
  );

  const t0 = Date.now();
  let rawClips = forceFallback
    ? []
    : formatted.length > CHUNK_THRESHOLD_CHARS
      ? await analyzeInChunks(transcript, videoTitle, channelName, config, minCuts, maxCuts, analyzeSinglePass)
      : await analyzeSinglePass(formatted, videoTitle, channelName, config, minCuts, maxCuts);

  if (rawClips.length === 0) {
    rawClips = buildFallbackClips(transcript, videoTitle, minCuts, maxCuts, config);
  }

  logger.info({ videoId: transcript.videoId, rawClips: rawClips.length }, "Raw clips from LLM before filtering");

  const result = processClips(rawClips, transcript, config, maxCuts);

  logger.info(
    { videoId: transcript.videoId, clipsFound: result.length, elapsedSec: ((Date.now() - t0) / 1000).toFixed(1) },
    "✅ Análise concluída!",
  );

  return result;
}

function buildFallbackClips(
  transcript: Transcript,
  videoTitle: string,
  minCuts: number,
  maxCuts: number,
  config: PipelineConfig,
): ClipItem[] {
  if (transcript.segments.length === 0) return [];

  const targetDuration = Math.min(config.maxShortDuration, Math.max(config.minShortDuration, 45));
  const candidates = transcript.segments
    .filter((segment) => segment.end - segment.start >= 2 && segment.text.trim().length >= 20)
    .sort((a, b) => Math.abs(a.start - 60) - Math.abs(b.start - 60));

  const first = candidates[0] ?? transcript.segments[0];
  /* v8 ignore start */
  if (!first) return [];
  /* v8 ignore stop */

  const startTime = Math.max(0, Math.floor(first.start));
  const endLimit = Math.min(transcript.duration, startTime + targetDuration);
  const endSegment = transcript.segments
    .filter((segment) => segment.end > startTime + config.minShortDuration && segment.end <= endLimit)
    .at(-1);
  const endTime = Math.max(startTime + config.minShortDuration, Math.floor(endSegment?.end ?? endLimit));

  if (endTime <= startTime || endTime - startTime > config.maxShortDuration) return [];

  logger.warn(
    { videoId: transcript.videoId, minCuts, maxCuts, startTime, endTime },
    "AI returned no clips; using deterministic fallback clip",
  );

  return [{
    title: "Uma mensagem de fé para hoje",
    description: `Trecho selecionado automaticamente de ${videoTitle}.`,
    contentValue: "Trecho com reflexão espiritual selecionado como fallback quando a IA local não retornou cortes.",
    startTime,
    endTime,
    viralScore: 5,
    reason: "Fallback determinístico para manter a geração e postagem quando o provedor de IA falha ou retorna vazio.",
    hashtags: ["#fé", "#oração", "#católico", "#evangelho"],
  }];
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
    logger.debug({ model: config.aiModel, promptLength: prompt.length }, "Enviando prompt para AI Provider (Tool-Hybrid Mode)");

    const { toolCalls, text } = await generateText({
      model: createModel(config),
      tools: {
        analyze: {
          description: "Analisa o transcript e retorna os melhores momentos para Shorts",
          parameters: ClipSchema,
        },
      },
      toolChoice: "auto", // Permite que ele escolha entre Tool ou Texto
      prompt,
      temperature: 0.7,
    });

    let clips: ClipItem[] = [];

    // Tenta extrair das tool calls
    if (toolCalls && toolCalls.length > 0) {
      const object = toolCalls[0].args as any;
      if (object?.clips) clips = object.clips;
    }

    // Se não veio via tool, tenta extrair do texto (Regex fallback)
    if (clips.length === 0 && text) {
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed && typeof parsed === "object" && parsed.clips) clips = parsed.clips;
          else if (Array.isArray(parsed)) clips = parsed;
        }
      } catch (e) {
        logger.error({ text: text.substring(0, 500) }, "Falha ao dar parse no JSON do texto da IA");
      }
    }

    if (clips.length === 0) {
      logger.warn({ hasText: !!text, toolCallsCount: toolCalls?.length }, "AI não retornou cortes válidos em nenhum formato.");
      return [];
    }
    
    return clips;
  } catch (err) {
    logger.error({ err, errorMessage: (err as Error).message }, "Falha crítica na chamada do LLM");
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
