/* v8 ignore start */
import { generateText } from "ai";
import { z } from "zod";
import { nanoid } from "nanoid";
import type {
  Transcript,
  ShortClip,
  TranscriptSegment,
  TranscriptWord,
  PipelineConfig,
} from "../types.js";
import { logger } from "./logger.js";
import { snapToSentenceBoundaries } from "./clip-boundary.js";
import { getMinCuts, getMaxCuts } from "./config.js";
import { createModel } from "./ai-provider.js";

const TOKENS_PER_CLIP = 250;      // rough output tokens per clip

const ClipSchema = z.object({
  clips: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      startTime: z.number(),
      endTime: z.number(),
      viralScore: z.number().min(1).max(10),
      reason: z.string(),
      hookLine: z.string(),
      hashtags: z.array(z.string()),
    }),
  ),
});



export async function analyzeTranscript(
  transcript: Transcript,
  videoTitle: string,
  channelName: string,
  config: PipelineConfig,
): Promise<ShortClip[]> {
  const minCuts = config.maxClipsOverride ?? getMinCuts(transcript.duration);
  const maxCuts = config.maxClipsOverride ?? getMaxCuts(transcript.duration);
  const transcriptChars = transcript.segments.reduce((n, s) => n + s.text.length, 0);

  logger.info(
    {
      videoId: transcript.videoId,
      minCuts,
      maxCuts,
      duration: transcript.duration,
      transcriptChars,
    },
    "🧠 Analisando vídeo completo com Ollama...",
  );

  const t0 = Date.now();
  const allClips = await analyzeFull(transcript, videoTitle, channelName, config, minCuts, maxCuts);
  const result = processClips(allClips, transcript, config, maxCuts);

  logger.info(
    {
      videoId: transcript.videoId,
      clipsFound: result.length,
      elapsedSec: ((Date.now() - t0) / 1000).toFixed(1),
    },
    "✅ Análise concluída!",
  );

  return result;
}

// ─── Full video analysis ──────────────────────────────────────────────────

async function analyzeFull(
  transcript: Transcript,
  videoTitle: string,
  channelName: string,
  config: PipelineConfig,
  minCuts: number,
  maxCuts: number,
): Promise<z.infer<typeof ClipSchema>["clips"]> {
  const formattedTranscript = formatTranscriptForLLM(transcript.segments);
  const prompt = buildAnalysisPrompt(
    formattedTranscript, videoTitle, channelName, minCuts, maxCuts,
    config.minShortDuration, config.maxShortDuration, transcript.duration,
  );
  
  // Estimate max tokens based on expected clips
  const maxOutputTokens = Math.min(2048, maxCuts * TOKENS_PER_CLIP + 500);

  const t0 = Date.now();
  try {
    logger.debug({ model: config.aiModel, promptLength: prompt.length }, "Sending prompt to AI Provider");
    const response = await generateText({ 
      model: createModel(config),
      prompt, 
      temperature: 0.5, 
      maxOutputTokens 
    });

    logger.debug({ 
      videoId: transcript.videoId, 
      usage: response.usage,
      rawText: response.text 
    }, "AI Provider Raw Response (Attempt 1)");

    const text = response.text;
    const parsed = extractAndParseJSON(text);
    if (!parsed) {
      logger.warn({ videoId: transcript.videoId, rawText: text }, "JSON inválido na primeira tentativa. Retentando...");
      const retryResponse = await generateText({
        model: createModel(config),
        prompt: prompt + "\n\nCRÍTICO: Você DEVE responder APENAS com JSON puro começando com { e terminando com }. Nenhuma explicação.",
        temperature: 0.2,
        maxOutputTokens,
      });
      
      logger.debug({ 
        videoId: transcript.videoId, 
        rawText: retryResponse.text 
      }, "AI Provider Raw Response (Attempt 2)");
      
      const retryParsed = extractAndParseJSON(retryResponse.text);
      if (!retryParsed) {
          logger.error({ videoId: transcript.videoId, finalRawText: retryResponse.text }, "AI falhou repetidamente em retornar JSON válido");
      }
      return retryParsed?.clips ?? [];
    }
    
    if (parsed.clips.length === 0) {
      logger.info({ videoId: transcript.videoId }, "AI retornou 0 cortes virais (lista vazia).");
    }
    
    return parsed.clips;
  } catch (err) {
    logger.error({ videoId: transcript.videoId, err, errorMessage: (err as Error).message }, "Falha catastrófica na chamada do LLM");
    return [];
  }
}



// ─── Prompt builder ──────────────────────────────────────────────────────────

function buildAnalysisPrompt(
  transcript: string,
  videoTitle: string,
  channelName: string,
  minClips: number,
  maxClips: number,
  minDuration: number,
  maxDuration: number,
  totalDuration: number,
): string {
  return `Você é um roteirista sênior de YouTube Shorts focado em MÁXIMA VIRALIDADE. Sua missão é encontrar os momentos mais IMPACTANTES deste vídeo.

VÍDEO ORIGINAL: "${videoTitle}"
CANAL: "${channelName}"

DIRETRIZES PARA OS TÍTULOS E CORTES:
- Use títulos EXTREMAMENTE clickbaits e virais (ex: "O Segredo Revelado", "Você não vai acreditar nisso").
- Foque em ganchos de retenção fortes (hooks) nos primeiros segundos para prender a atenção do público imediatamente.
- Mantenha um ritmo acelerado e selecione trechos com alta probabilidade de retenção e engajamento.
- O título deve ser em Português (pt-BR).
- É PROIBIDO usar as palavras: "corte", "clipe", "short", "vídeo", "canal", "parte".
- O tempo de cada clipe deve ser entre ${minDuration} e ${maxDuration} segundos.
- O clipe DEVE encerrar em uma frase completa ou pensamento concluído.
- O título deve fazer sentido sozinho, sem o vídeo original, e ser direto e impactante (máx 50 caracteres).
- No máximo ${Math.min(15, maxClips)} cortes devem ser retornados.

TRANSRITO DO VÍDEO:
${transcript}

Responda APENAS com uma lista JSON pura de recortes, onde o elemento raiz é um objeto com a chave "clips".
Exemplo de formato esperado:
{"clips":[{"title":"Título Extremamente Clickbait","description":"...","startTime":0.0,"endTime":50.0,"viralScore":10,"reason":"...","hookLine":"...","hashtags":["#viral","#shorts"]}]}`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeTimestamps(text: string): string {
  text = text.replace(
    /"(startTime|endTime)":\s*"(\d{1,2}):(\d{2}(?:\.\d+)?)"/g,
    (_, key, min, sec) => `"${key}": ${parseFloat(min) * 60 + parseFloat(sec)}`,
  );
  text = text.replace(
    /"(startTime|endTime)":\s*(\d{1,2}):(\d{2}(?:\.\d+)?)/g,
    (_, key, min, sec) => `"${key}": ${parseFloat(min) * 60 + parseFloat(sec)}`,
  );
  return text;
}

function extractAndParseJSON(text: string): z.infer<typeof ClipSchema> | null {
  text = normalizeTimestamps(text);
  try {
    const direct = ClipSchema.safeParse(JSON.parse(text));
    if (direct.success) return direct.data;
  } catch { /* not pure JSON */ }

  const jsonMatch = text.match(/\{[\s\S]*"clips"[\s\S]*\}/);
  if (jsonMatch?.[0]) {
    try {
      const parsed = ClipSchema.safeParse(JSON.parse(jsonMatch[0]));
      if (parsed.success) return parsed.data;
    } catch { /* invalid */ }
  }

  return null;
}

function processClips(
  clips: z.infer<typeof ClipSchema>["clips"],
  transcript: Transcript,
  config: PipelineConfig,
  maxCuts: number,
): ShortClip[] {
  return clips
    .filter((clip) => {
      const duration = clip.endTime - clip.startTime;
      return duration >= config.minShortDuration && 
             duration <= config.maxShortDuration &&
             clip.startTime >= 0 && 
             clip.endTime <= transcript.duration;
    })
    .sort((a, b) => b.viralScore - a.viralScore)
    .slice(0, maxCuts)
    .map((clip) => {
      const snapped = snapToSentenceBoundaries(clip, transcript.segments, config);
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
        hookLine: clip.hookLine,
        transcript: getSegmentsInRange(transcript.segments, snapped.startTime, snapped.endTime),
        words: getWordsInRange(transcript.words, snapped.startTime, snapped.endTime),
        hashtags: clip.hashtags,
      };
    });
}

function formatTranscriptForLLM(segments: TranscriptSegment[]): string {
  return segments
    .map((seg) => `[${formatTime(seg.start)}-${formatTime(seg.end)}] ${seg.text}`)
    .join("\n");
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
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
/* v8 ignore stop */
