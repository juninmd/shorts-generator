import { generateText, generateObject } from "ai";
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
    "Analisando vídeo com AI Provider...",
  );

  const t0 = Date.now();
  const rawClips = formatted.length > CHUNK_THRESHOLD_CHARS
    ? await analyzeInChunks(transcript, videoTitle, channelName, config, minCuts, maxCuts, analyzeSinglePass)   
    : await analyzeSinglePass(formatted, videoTitle, channelName, config, minCuts, maxCuts);

  logger.info({ videoId: transcript.videoId, rawClips: rawClips.length }, "Raw clips from LLM before filtering");

  const result = processClips(rawClips, transcript, config, maxCuts);

  logger.info(
    { videoId: transcript.videoId, clipsFound: result.length, elapsedSec: ((Date.now() - t0) / 1000).toFixed(1) },
    "Análise concluída!",
  );

  return result;
}

// Single-pass LLM call

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

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.aiTimeoutMs ?? 300_000);

  try {
    logger.debug({ model: config.aiModel, promptLength: prompt.length }, "Enviando prompt para AI Provider (Object Mode)");

    const { object } = await generateObject({
      model: createModel(config),
      schema: ClipSchema,
      prompt,
      temperature: 0.7,
      maxRetries: 5,
      abortSignal: controller.signal,
    });

    clearTimeout(timeoutId);
    logger.debug({ aiObject: JSON.stringify(object).substring(0, 1000) }, "Objeto retornado pela IA");

    const clips = object.clips || [];
    if (clips.length === 0) {
      logger.warn("AI retornou objeto vazio ou sem clips.");
      return [];
    }

    return clips;
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      logger.error({ videoTitle }, "Timeout na chamada do LLM (Object Mode)");
    } else {
      logger.error({ err, errorMessage: err instanceof Error ? err.message : String(err) }, "Falha crítica na chamada do LLM (Object Mode). Tentando fallback...");
    }
    return analyzeSinglePassFallback(transcript, videoTitle, channelName, config, minCuts, maxCuts);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function analyzeSinglePassFallback(
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

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.aiTimeoutMs ?? 300_000);

  try {
    const { text } = await generateText({
      model: createModel(config),
      prompt: prompt + "\n\nIMPORTANTE: Retorne APENAS o JSON no formato solicitado, sem textos explicativos.",
      temperature: 0.7,
      maxRetries: 5,
      abortSignal: controller.signal,
    });

    clearTimeout(timeoutId);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.clips || (Array.isArray(parsed) ? parsed : []);
    }
    return [];
  } catch (e: unknown) {
    clearTimeout(timeoutId);
    logger.error({ error: e instanceof Error ? e.message : String(e) }, "Falha no fallback do LLM");
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

// Prompt

function buildAnalysisPrompt(
  transcript: string,
  videoTitle: string,
  channelName: string,
  minClips: number,
  maxClips: number,
  minDuration: number,
  maxDuration: number,
): string {
  return `Você é um editor de vídeo profissional especializado em cortes virais (YouTube Shorts, TikTok, Reels).
Sua missão: identificar os trechos mais interessantes, impactantes, engraçados ou informativos da transcrição fornecida. Cada corte deve ser uma "pílula de conteúdo" autocontida, com sentido completo e compreensível sem o resto do vídeo.

VÍDEO: "${videoTitle}"
CANAL: "${channelName}"

PRIORIDADE: selecione por este tipo de conteúdo (nesta ordem):
1. Revelações surpreendentes, segredos ou fatos curiosos/inesperados
2. Histórias ou anedotas com início, meio e clímax/conclusão claros
3. Debates calorosos, opiniões fortes ou declarações impactantes
4. Explicações cativantes de tópicos interessantes (ciência, tecnologia, comportamento)
5. Momentos engraçados, piadas ou reações divertidas

SE o conteúdo for católico/espiritual/religioso (pregações, homilias, orações, estudos bíblicos), MUDE a prioridade para:
1. Passagens bíblicas citadas E comentadas (inclua início e fim da citação)
2. Histórias ou parábolas com início, meio e fim claros
3. Ensinamentos morais que concluam um raciocínio completo
4. Momentos de oração com início e fim delimitados
5. Exemplos de vida de santos ou fatos históricos religiosos

OBRIGATÓRIO:
- O trecho DEVE começar em uma ideia nova (não no meio de uma frase ou assunto inacabado)
- O trecho DEVE terminar com uma frase completa e com sentido de conclusão
- Um espectador sem contexto DEVE entender a mensagem principal imediatamente
- Duração: entre ${minDuration} e ${maxDuration} segundos
- Cada linha da transcrição está no formato [inicio_em_segundos - fim_em_segundos] texto. Use estes segundos diretamente para startTime e endTime (ex: se o trecho começa no segmento [45.00-48.00] e termina no segmento [70.00-73.00], configure startTime=45 e endTime=73).
- Retornar no mínimo ${minClips} e no máximo ${maxClips} cortes

PROIBIDO: não selecione trechos que:
- Comecem com referências ao que foi falado antes ("como eu disse antes", "voltando ao assunto")
- Dependam de referências visuais que o espectador não conseguirá entender apenas ouvindo
- Sejam cortados abruptamente no meio de uma frase ou ideia

PONTUAÇÃO viralScore (1-10):
- 9-10: Declaração bombástica, revelação chocante ou piada extremamente engraçada com excelente gancho (hook) inicial
- 7-8: História interessante ou explicação clara de um conceito cativante
- 5-6: Reflexão curiosa ou conversa informal com valor moderado de entretenimento
- 1-4: Fragmento sem gancho, sem sentido completo ou chato

Títulos em Português (pt-BR), máx 50 caracteres, sem: "corte", "clipe", "short", "vídeo", "canal", "parte".

TRANSCRIÇÃO:
${transcript}`;
}
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
