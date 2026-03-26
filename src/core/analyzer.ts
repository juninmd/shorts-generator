import { generateText } from "ai";
import { createOllama } from "ollama-ai-provider";
import { Agent, fetch as undiciFetch } from "undici";
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

function buildOllamaFetch(timeoutMs: number): typeof fetch {
  const agent = new Agent({
    headersTimeout: timeoutMs,
    bodyTimeout: timeoutMs,
    connectTimeout: 30_000,
  });
  return (input, init?) =>
    undiciFetch(input as Parameters<typeof undiciFetch>[0], {
      ...(init as Parameters<typeof undiciFetch>[1]),
      dispatcher: agent,
    }) as unknown as Promise<Response>;
}

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
  const maxTokens = Math.min(2048, maxCuts * TOKENS_PER_CLIP + 500);

  const t0 = Date.now();
  try {
    const { text } = await generateText({ 
      model: createOllamaModel(config), 
      prompt, 
      temperature: 0.5, 
      maxTokens 
    });

    const parsed = extractAndParseJSON(text);
    if (!parsed) {
      logger.warn({ videoId: transcript.videoId }, "JSON inválido, tentando novamente com prompt reforçado...");
      const { text: retryText } = await generateText({
        model: createOllamaModel(config),
        prompt: prompt + "\n\nResponda APENAS com JSON puro, sem markdown ou explicações.",
        temperature: 0.2,
        maxTokens,
      });
      return extractAndParseJSON(retryText)?.clips ?? [];
    }
    return parsed.clips;
  } catch (err) {
    logger.error({ videoId: transcript.videoId, err }, "Falha na chamada do Ollama");
    return [];
  }
}

function createOllamaModel(config: PipelineConfig) {
  return createOllama({
    baseURL: config.ollamaBaseUrl + "/api",
    fetch: buildOllamaFetch(config.ollamaTimeoutMs),
  })(config.ollamaModel, { 
    structuredOutputs: false,
    config: {
      keepAlive: 0,
    }
  });
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
  return `Você é um roteirista sênior de YouTube Shorts. Sua missão é encontrar os momentos mais IMPACTANTES e ESPIRITUAIS deste vídeo.

VÍDEO ORIGINAL: "${videoTitle}"
CANAL: "${channelName}"

DIRETRIZES PARA OS TÍTULOS:
- O título deve ser sobre a MENSAGEM do vídeo (ex: "O Segredo da Oração", "Como vencer o pecado").
- É PROIBIDO usar as palavras: "corte", "clipe", "short", "vídeo", "canal", "parte".
- O tempo de cada clipe deve ser entre 40 e 70 segundos para garantir uma reflexão profunda.
- O clipe DEVE encerrar em uma frase completa ou pensamento concluído (evite cortes no meio da fala).
- Use um tom de curiosidade, fé ou sabedoria. Seja direto e impactante (máx 50 caracteres).
- O título deve fazer sentido sozinho, sem o vídeo original.

TRANSRITO DO VÍDEO:
${transcript}

Responda APENAS com JSON puro:
{"clips":[{"title":"Título sobre o conteúdo","description":"...","startTime":0.0,"endTime":50.0,"viralScore":9,"reason":"...","hookLine":"...","hashtags":["#fe","#deus"]}]}`;
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
