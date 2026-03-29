/* v8 ignore start */
import { generateObject } from "ai";
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

const ClipItemSchema = z.object({
  title: z.string().describe("Título chamativo e relevante para o trecho"),
  description: z.string().describe("Breve resumo do conteúdo deste clipe"),
  contentValue: z.string().describe("Explique o valor deste trecho (ex: uma oração, um ensinamento, uma reflexão profunda)"),
  startTime: z.number().describe("Tempo de início em segundos"),
  endTime: z.number().describe("Tempo de fim em segundos"),
  viralScore: z.number().describe("Pontuação de interesse/relevância de 1 a 10"),
  reason: z.string().describe("Por que este momento foi escolhido?"),
  hashtags: z.array(z.string()).describe("Hashtags relevantes para o Shorts"),
});

const ClipSchema = z.object({
  clips: z.array(ClipItemSchema),
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
    "🧠 Analisando vídeo completo com AI Provider...",
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

type ClipItem = z.infer<typeof ClipItemSchema>;

async function analyzeFull(
  transcript: Transcript,
  videoTitle: string,
  channelName: string,
  config: PipelineConfig,
  minCuts: number,
  maxCuts: number,
): Promise<ClipItem[]> {
  const formattedTranscript = formatTranscriptForLLM(transcript.segments);
  const prompt = buildAnalysisPrompt(
    formattedTranscript, videoTitle, channelName, minCuts, maxCuts,
    config.minShortDuration, config.maxShortDuration,
  );

  try {
    logger.debug({ model: config.aiModel, promptLength: prompt.length }, "Sending structured prompt to AI Provider");

    const { object } = await generateObject({
      model: createModel(config),
      schema: ClipSchema,
      prompt,
      temperature: 0.6,
    });

    if (!object || !object.clips) {
      logger.error({ videoId: transcript.videoId }, "AI falhou em retornar um objeto válido com a lista de clipes");
      return [];
    }

    if (object.clips.length === 0) {
      logger.info({ videoId: transcript.videoId }, "AI retornou 0 cortes virais (lista vazia).");
    }

    return object.clips;
  } catch (err) {
    logger.error({ videoId: transcript.videoId, err, errorMessage: (err as Error).message }, "Falha catastrófica na chamada estruturada do LLM");
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
): string {
  return `Você é um editor especializado em YouTube Shorts e Reels, focado em extrair as melhores "pílulas" de conteúdo de um vídeo. Sua missão é encontrar trechos que façam sentido como conteúdos curtos e independentes.

VÍDEO ORIGINAL: "${videoTitle}"
CANAL: "${channelName}"

OBJETIVO:
Identificar momentos marcantes, orações, ensinamentos, reflexões ou insights que sejam interessantes para o público. Mesmo que o vídeo seja calmo ou religioso, extraia as partes mais significativas.

CRÍTICO:
- NÃO retorne uma lista vazia. Você DEVE encontrar pelo menos os momentos mais didáticos ou oracionais se não houver algo "explosivo".
- Foque na relevância espiritual e na clareza do ensinamento.

DIRETRIZES PARA OS TÍTULOS E CORTES:
- Use títulos que despertem curiosidade ou tragam paz (ex: "A Força da Oração", "O Segredo da Fé").
- O título deve ser em Português (pt-BR) e ter no máximo 50 caracteres.
- Foque em trechos que tenham um início claro e um fim que conclua o raciocínio.
- É PROIBIDO usar as palavras: "corte", "clipe", "short", "vídeo", "canal", "parte".
- O tempo de cada clipe deve ser entre ${minDuration} e ${maxDuration} segundos.
- O clipe DEVE encerrar em uma frase completa ou pensamento concluído.
- O título deve fazer sentido sozinho, sem o vídeo original, e ser direto e impactante (máx 50 caracteres).
- No máximo ${Math.min(15, maxClips)} cortes devem ser retornados.

TRANSRITO DO VÍDEO:
${transcript}`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function processClips(
  clips: ClipItem[],
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
    .map((clip: ClipItem) => {
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
