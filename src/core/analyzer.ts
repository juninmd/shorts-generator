import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { nanoid } from "nanoid";
import type {
  Transcript,
  ShortClip,
  TranscriptSegment,
  TranscriptWord,
  PipelineConfig,
} from "../types.js";
import { getMaxCuts } from "./config.js";
import { logger } from "./logger.js";

const ClipSchema = z.object({
  clips: z.array(
    z.object({
      title: z
        .string()
        .describe("Título chamativo e curto para o short (máx 60 chars)"),
      description: z
        .string()
        .describe("Descrição curta para engajamento (máx 150 chars)"),
      startTime: z
        .number()
        .describe("Tempo de início do corte em segundos"),
      endTime: z
        .number()
        .describe("Tempo de fim do corte em segundos"),
      viralScore: z
        .number()
        .min(1)
        .max(10)
        .describe("Score de potencial viral de 1 a 10"),
      reason: z
        .string()
        .describe("Razão pela qual esse trecho tem potencial viral"),
      hookLine: z
        .string()
        .describe("Frase de gancho para os primeiros 3 segundos do short"),
      hashtags: z
        .array(z.string())
        .describe("3-5 hashtags relevantes para o short"),
    }),
  ),
});

/**
 * Analyze transcript using LLM to identify the best moments for shorts.
 */
export async function analyzeTranscript(
  transcript: Transcript,
  videoTitle: string,
  channelName: string,
  config: PipelineConfig,
): Promise<ShortClip[]> {
  const maxCuts = getMaxCuts(
    transcript.duration,
    config.maxCutsPerBlock,
    config.minuteBlockSize,
  );

  logger.info(
    {
      videoId: transcript.videoId,
      maxCuts,
      duration: transcript.duration,
    },
    "Analyzing transcript for viral moments",
  );

  // Format transcript with timestamps for the LLM
  const formattedTranscript = formatTranscriptForLLM(transcript.segments);

  const { object } = await generateObject({
    model: openai(config.openaiModel),
    schema: ClipSchema,
    prompt: buildAnalysisPrompt(
      formattedTranscript,
      videoTitle,
      channelName,
      maxCuts,
      config.minShortDuration,
      config.maxShortDuration,
      transcript.duration,
    ),
    temperature: 0.7,
  });

  const clips: ShortClip[] = object.clips
    .filter((clip) => {
      const duration = clip.endTime - clip.startTime;
      return (
        duration >= config.minShortDuration &&
        duration <= config.maxShortDuration &&
        clip.startTime >= 0 &&
        clip.endTime <= transcript.duration
      );
    })
    .sort((a, b) => b.viralScore - a.viralScore)
    .slice(0, maxCuts)
    .map((clip) => ({
      id: nanoid(10),
      videoId: transcript.videoId,
      title: clip.title,
      description: clip.description,
      startTime: clip.startTime,
      endTime: clip.endTime,
      duration: clip.endTime - clip.startTime,
      viralScore: clip.viralScore,
      reason: clip.reason,
      hookLine: clip.hookLine,
      transcript: getSegmentsInRange(
        transcript.segments,
        clip.startTime,
        clip.endTime,
      ),
      words: getWordsInRange(transcript.words, clip.startTime, clip.endTime),
      hashtags: clip.hashtags,
    }));

  logger.info(
    {
      videoId: transcript.videoId,
      clipsFound: clips.length,
      avgScore: clips.length
        ? (clips.reduce((s, c) => s + c.viralScore, 0) / clips.length).toFixed(1)
        : 0,
    },
    "Analysis complete",
  );

  return clips;
}

function formatTranscriptForLLM(segments: TranscriptSegment[]): string {
  return segments
    .map((seg) => {
      const start = formatTime(seg.start);
      const end = formatTime(seg.end);
      return `[${start} -> ${end}] ${seg.text}`;
    })
    .join("\n");
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function buildAnalysisPrompt(
  transcript: string,
  videoTitle: string,
  channelName: string,
  maxClips: number,
  minDuration: number,
  maxDuration: number,
  totalDuration: number,
): string {
  return `Você é um especialista em conteúdo viral para YouTube Shorts, TikTok e Instagram Reels.

Analise a transcrição do vídeo abaixo e identifique os **melhores momentos** que podem gerar shorts virais.

## Informações do Vídeo
- **Título:** ${videoTitle}
- **Canal:** ${channelName}
- **Duração total:** ${formatTime(totalDuration)}

## Critérios para seleção de cortes:
1. **Gancho forte** — os primeiros 3 segundos devem prender a atenção
2. **Conteúdo autossuficiente** — o trecho deve fazer sentido sozinho, sem contexto adicional
3. **Emoção ou surpresa** — momentos que geram reação (surpresa, humor, polêmica, inspiração)
4. **Informação valiosa** — dicas, revelações, dados surpreendentes
5. **Potencial de compartilhamento** — algo que as pessoas queiram enviar para outros
6. **Início e fim limpos** — o corte deve começar e terminar em pausas naturais da fala

## Regras:
- Encontre no máximo **${maxClips} cortes**
- Cada corte deve ter entre **${minDuration}** e **${maxDuration} segundos**
- Os cortes NÃO devem se sobrepor
- Priorize qualidade sobre quantidade — é melhor 3 cortes excelentes do que ${maxClips} mediocres
- Se não houver bons momentos, retorne menos cortes
- Os tempos devem corresponder EXATAMENTE aos timestamps da transcrição
- Inclua uma margem de ~1 segundo antes e depois do trecho para evitar cortes abruptos

## Transcrição:
${transcript}

Retorne os melhores cortes ordenados por potencial viral (maior score primeiro).`;
}

function getSegmentsInRange(
  segments: TranscriptSegment[],
  start: number,
  end: number,
): TranscriptSegment[] {
  return segments
    .filter((seg) => seg.start >= start - 0.5 && seg.end <= end + 0.5)
    .map((seg) => ({
      start: Math.max(0, seg.start - start),
      end: seg.end - start,
      text: seg.text,
    }));
}

function getWordsInRange(
  words: TranscriptWord[],
  start: number,
  end: number,
): TranscriptWord[] {
  return words
    .filter((w) => w.start >= start - 0.1 && w.end <= end + 0.1)
    .map((w) => ({
      word: w.word,
      start: Math.max(0, w.start - start),
      end: w.end - start,
    }));
}
