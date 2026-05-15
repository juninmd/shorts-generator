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
    "ðŸ§  Analisando vÃ­deo com AI Provider...",
  );

  const t0 = Date.now();
  const rawClips = formatted.length > CHUNK_THRESHOLD_CHARS
    ? await analyzeInChunks(transcript, videoTitle, channelName, config, minCuts, maxCuts, analyzeSinglePass)   
    : await analyzeSinglePass(formatted, videoTitle, channelName, config, minCuts, maxCuts);

  logger.info({ videoId: transcript.videoId, rawClips: rawClips.length }, "Raw clips from LLM before filtering");

  const result = processClips(rawClips, transcript, config, maxCuts);

  logger.info(
    { videoId: transcript.videoId, clipsFound: result.length, elapsedSec: ((Date.now() - t0) / 1000).toFixed(1) },
    "âœ… AnÃ¡lise concluÃ­da!",
  );

  return result;
}

// â”€â”€â”€ Single-pass LLM call â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  const timeoutId = setTimeout(() => controller.abort(), config.aiTimeoutMs || 600000);

  try {
    logger.debug({ model: config.aiModel, promptLength: prompt.length }, "Enviando prompt para AI Provider (Object Mode)");

    const { object } = await generateObject({
      model: createModel(config),
      schema: ClipSchema,
      prompt,
      temperature: 0.7,
      maxRetries: 5,
      abortSignal: controller.signal as any,
    });

    clearTimeout(timeoutId);
    logger.debug({ aiObject: JSON.stringify(object).substring(0, 1000) }, "Objeto retornado pela IA");
    
    const clips = object.clips || [];
    if (clips.length === 0) {
      logger.warn("AI retornou objeto vazio ou sem clips.");
      return [];
    }

    return clips;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      logger.error({ videoTitle }, "Timeout na chamada do LLM (Object Mode)");
    } else {
      logger.error({ err, errorMessage: err.message }, "Falha crÃ­tica na chamada do LLM (Object Mode). Tentando fallback...");
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
  const timeoutId = setTimeout(() => controller.abort(), config.aiTimeoutMs || 600000);

  try {
    const { text } = await generateText({
      model: createModel(config),
      prompt: prompt + "\\n\\nIMPORTANTE: Retorne APENAS o JSON no formato solicitado, sem textos explicativos.", 
      temperature: 0.7,
      maxRetries: 5,
      abortSignal: controller.signal as any,
    });

    clearTimeout(timeoutId);
    const jsonMatch = text.match(/\\{[\\s\\S]*\\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.clips || (Array.isArray(parsed) ? parsed : []);
    }
    return [];
  } catch (e: any) {
    clearTimeout(timeoutId);
    logger.error({ error: e.message }, "Falha no fallback do LLM");
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

// â”€â”€â”€ Prompt â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€      

function buildAnalysisPrompt(
  transcript: string,
  videoTitle: string,
  channelName: string,
  minClips: number,
  maxClips: number,
  minDuration: number,
  maxDuration: number,
): string {
  return `VocÃª Ã© um editor especializado em conteÃºdo espiritual e religioso para YouTube Shorts.
Sua missÃ£o: encontrar trechos que sejam "pÃ­lulas de conteÃºdo" â€” autocontidos, com sentido completo, sem depender do resto do vÃ­deo.

VÃDEO: "${videoTitle}"
CANAL: "${channelName}"

PRIORIDADE â€” selecione por este tipo de conteÃºdo (nesta ordem):
1. Passagens bÃ­blicas citadas E comentadas (inclua inÃ­cio e fim da citaÃ§Ã£o)
2. HistÃ³rias ou parÃ¡bolas com inÃ­cio, meio e fim claros
3. Ensinamentos morais que concluam um raciocÃ­nio completo
4. Momentos de oraÃ§Ã£o com inÃ­cio e fim delimitados
5. Exemplos de vida de santos ou fatos histÃ³ricos religiosos

OBRIGATÃ“RIO:
- O trecho DEVE comeÃ§ar em uma ideia nova (nÃ£o no meio de uma frase)
- O trecho DEVE terminar com frase completa e conclusÃ£o
- Um espectador sem contexto DEVE entender tudo
- DuraÃ§Ã£o: entre ${minDuration} e ${maxDuration} segundos
- Retornar no mÃ­nimo ${minClips} e no mÃ¡ximo ${Math.min(20, maxClips)} cortes

PROIBIDO â€” nÃ£o selecione trechos que:
- Comecem com referÃªncias ao que foi dito antes ("como vimos", "voltando", "como mencionei")
- Referenciem gestos, slides ou "o que estÃ¡ na tela"
- Sejam interrompidos no meio de uma histÃ³ria ou argumento

PONTUAÃ‡ÃƒO viralScore (1â€“10):
- 9â€“10: Passagem bÃ­blica delimitada OU histÃ³ria completa com moral clara
- 7â€“8: Ensinamento que conclui um raciocÃ­nio sem contexto externo
- 5â€“6: ReflexÃ£o interessante com contexto leve dispensÃ¡vel
- 1â€“4: Fragmento incompleto ou dependente de contexto

TÃ­tulos em PortuguÃªs (pt-BR), mÃ¡x 50 caracteres, sem: "corte", "clipe", "short", "vÃ­deo", "canal", "parte". 

TRANSCRIÃ‡ÃƒO:
${transcript}`;
}

// â”€â”€â”€ Post-processing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
