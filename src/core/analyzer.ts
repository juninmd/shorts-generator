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
import { snapToSentenceBoundaries } from "./clip-boundary";
import { getMinCuts, getMaxCuts } from "./config.js";

const CHUNK_SECS = 120;           // 2-minute windows per LLM call
const CHUNK_THRESHOLD_SECS = 180; // use chunking for videos longer than 3 min
const TOKENS_PER_CLIP = 200;      // rough output tokens per clip

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
  const estimatedInputTokens = Math.round(transcriptChars / 4);
  const useChunks = transcript.duration > CHUNK_THRESHOLD_SECS;

  logger.info(
    {
      videoId: transcript.videoId,
      minCuts,
      maxCuts,
      duration: transcript.duration,
      model: config.ollamaModel,
      transcriptChars,
      estimatedInputTokens,
      strategy: useChunks ? `chunks(${Math.ceil(transcript.duration / CHUNK_SECS)})` : "single",
    },
    "Analyzing transcript for viral moments (Ollama)",
  );

  const t0 = Date.now();

  const allClips = useChunks
    ? await analyzeInChunks(transcript, videoTitle, channelName, config, maxCuts)
    : await analyzeSingle(transcript, videoTitle, channelName, config, minCuts, maxCuts);

  const result = processClips(allClips, transcript, config, maxCuts);

  logger.info(
    {
      videoId: transcript.videoId,
      clipsFound: result.length,
      elapsedMs: Date.now() - t0,
      elapsedSec: ((Date.now() - t0) / 1000).toFixed(1),
    },
    "Analysis benchmark",
  );

  return result;
}

// ─── Single-shot analysis (short videos ≤ CHUNK_THRESHOLD_SECS) ──────────────

async function analyzeSingle(
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
  const maxTokens = Math.min(1024, maxCuts * TOKENS_PER_CLIP + 200);

  const t0 = Date.now();
  const { text } = await generateText({ model: createOllamaModel(config), prompt, temperature: 0.5, maxTokens });
  logger.info(
    { videoId: transcript.videoId, elapsedMs: Date.now() - t0, outputChars: text.length, maxTokens },
    "Ollama single call done",
  );

  const parsed = extractAndParseJSON(text);
  if (!parsed) {
    logger.warn({ videoId: transcript.videoId, rawResponse: text.slice(0, 300) }, "LLM returned invalid JSON, retrying once...");
    const t1 = Date.now();
    const { text: retryText } = await generateText({
      model: createOllamaModel(config),
      prompt: prompt + "\n\nIMPORTANT: Respond ONLY with valid JSON. No markdown, no explanation.",
      temperature: 0.2,
      maxTokens,
    });
    logger.info({ videoId: transcript.videoId, elapsedMs: Date.now() - t1 }, "Ollama retry done");
    return extractAndParseJSON(retryText)?.clips ?? [];
  }
  return parsed.clips;
}

// ─── Chunked analysis (long videos > CHUNK_THRESHOLD_SECS) ───────────────────

async function analyzeInChunks(
  transcript: Transcript,
  videoTitle: string,
  channelName: string,
  config: PipelineConfig,
  maxCuts: number,
): Promise<z.infer<typeof ClipSchema>["clips"]> {
  const chunks = chunkSegments(transcript.segments, CHUNK_SECS);
  logger.info({ videoId: transcript.videoId, totalChunks: chunks.length }, "Starting chunked analysis (sequential for GHA)");

  const allClips: z.infer<typeof ClipSchema>["clips"] = [];
  const chunkTimes: number[] = [];

  // Process chunks sequentially to avoid overloading CPU (especially in GitHub Actions)
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkStart = chunk[0].start;
    const chunkEnd = chunk[chunk.length - 1].end;
    const chunkChars = chunk.reduce((n, s) => n + s.text.length, 0);
    const formatted = formatTranscriptForLLM(chunk);
    const prompt = buildChunkPrompt(formatted, videoTitle, channelName, chunkStart, chunkEnd, config);
    const maxTokens = TOKENS_PER_CLIP + 100;

    const t0 = Date.now();
    logger.info(
      {
        videoId: transcript.videoId,
        chunk: `${i + 1}/${chunks.length}`,
        range: `${formatTime(chunkStart)}-${formatTime(chunkEnd)}`,
        chunkChars,
        maxTokens,
      },
      "Ollama chunk start",
    );

    try {
      const { text } = await generateText({ 
        model: createOllamaModel(config), 
        prompt, 
        temperature: 0.4, 
        maxTokens 
      });
      
      const elapsedMs = Date.now() - t0;
      chunkTimes.push(elapsedMs);
      const parsed = extractAndParseJSON(text);

      const validClips = (parsed?.clips ?? []).filter((clip) => {
        return clip.startTime >= chunkStart && clip.startTime < chunkEnd;
      });

      logger.info(
        {
          videoId: transcript.videoId,
          chunk: `${i + 1}/${chunks.length}`,
          elapsedMs,
          elapsedSec: (elapsedMs / 1000).toFixed(1),
          clipsFound: validClips.length,
        },
        "Ollama chunk done",
      );
      
      if (validClips.length) allClips.push(...validClips);
    } catch (err) {
      logger.warn({ videoId: transcript.videoId, chunk: `${i + 1}/${chunks.length}`, err }, "Chunk failed, skipping");
    }
  }

  const totalMs = chunkTimes.reduce((a, b) => a + b, 0);
  const avgMs = chunkTimes.length ? Math.round(totalMs / chunkTimes.length) : 0;
  logger.info(
    {
      videoId: transcript.videoId,
      totalChunks: chunks.length,
      totalClipsFound: allClips.length,
      avgSecPerChunk: (avgMs / 1000).toFixed(1),
    },
    "Chunked analysis complete",
  );

  return allClips;
}

function chunkSegments(segments: TranscriptSegment[], chunkDuration: number): TranscriptSegment[][] {
  if (segments.length === 0) return [];
  const chunks: TranscriptSegment[][] = [];
  let chunkStart = segments[0].start;
  let current: TranscriptSegment[] = [];

  for (const seg of segments) {
    if (seg.start >= chunkStart + chunkDuration && current.length > 0) {
      chunks.push(current);
      current = [];
      chunkStart = seg.start;
    }
    current.push(seg);
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

function createOllamaModel(config: PipelineConfig) {
  return createOllama({
    baseURL: config.ollamaBaseUrl + "/api",
    fetch: buildOllamaFetch(config.ollamaTimeoutMs),
  })(config.ollamaModel, { 
    structuredOutputs: false,
    config: {
      keepAlive: 0, // Release model from RAM immediately after request
    }
  });
}

// ─── Prompt builders ──────────────────────────────────────────────────────────

function buildChunkPrompt(
  transcript: string,
  videoTitle: string,
  channelName: string,
  chunkStart: number,
  chunkEnd: number,
  config: PipelineConfig,
): string {
  const exampleStart = chunkStart;
  const exampleEnd = Math.min(chunkStart + config.minShortDuration, chunkEnd);
  return `Viral PT-BR YouTube Shorts expert.
Video: "${videoTitle}" (${channelName}). Segment: ${formatTime(chunkStart)}–${formatTime(chunkEnd)}.

Pick the BEST moment in this segment for a ${config.minShortDuration}–${config.maxShortDuration}s short. You MUST return exactly 1 clip.
- startTime/endTime MUST be within ${chunkStart}–${chunkEnd} (absolute seconds, as shown in the transcript)
- Start and end at sentence boundaries
- Viral PT-BR title (max 60 chars), high retention hook

${transcript}

JSON only (no markdown), use absolute seconds from transcript:
{"clips":[{"title":"...","description":"...","startTime":${exampleStart},"endTime":${exampleEnd},"viralScore":8,"reason":"...","hookLine":"...","hashtags":["#tag"]}]}`;
}

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
  return `Viral PT-BR YouTube Shorts expert. Find ${minClips}–${maxClips} viral clips in this video.

Video: "${videoTitle}" (${channelName}) — ${formatTime(totalDuration)}

Rules:
- ${minClips}–${maxClips} clips, each ${minDuration}–${maxDuration}s, no overlap
- Start/end at sentence boundaries (never mid-sentence)
- Viral, punchy PT-BR title (max 60 chars) — include speaker name if identifiable
- High retention hook: scroll-stopping first sentence, strong payoff, self-contained story
- startTime/endTime must match transcript segment boundaries exactly

${transcript}

JSON only (no markdown):
{"clips":[{"title":"...","description":"...","startTime":0,"endTime":0,"viralScore":1,"reason":"...","hookLine":"...","hashtags":["#tag"]}]}`;
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

  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch?.[1]) {
    try {
      const parsed = ClipSchema.safeParse(JSON.parse(codeBlockMatch[1]));
      if (parsed.success) return parsed.data;
    } catch { /* invalid */ }
  }

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
    .map((clip) => {
      const duration = clip.endTime - clip.startTime;
      if (duration < config.minShortDuration) {
        const targetEnd = clip.startTime + config.minShortDuration;
        const expanded = transcript.segments
          .filter((seg) => seg.start >= clip.startTime && seg.end <= targetEnd + 30)
          .at(-1);
        if (expanded && expanded.end > clip.endTime) {
          return { ...clip, endTime: Math.min(expanded.end, transcript.duration) };
        }
      }
      return clip;
    })
    .filter((clip) => {
      const duration = clip.endTime - clip.startTime;
      const ok =
        duration >= config.minShortDuration &&
        duration <= config.maxShortDuration &&
        clip.startTime >= 0 &&
        clip.endTime <= transcript.duration;
      if (!ok) logger.debug({ title: clip.title, startTime: clip.startTime, endTime: clip.endTime, duration }, "Clip filtered out");
      return ok;
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
