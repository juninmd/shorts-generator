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

const CHUNK_SECS = 120; // 2-minute windows per LLM call
const CHUNK_THRESHOLD_SECS = 180; // use chunking for videos longer than 3 min
const TOKENS_PER_CLIP = 200; // rough output tokens per clip

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
      model: config.ollamaModel,
      transcriptChars,
      estimatedTokens: Math.round(transcriptChars / 4),
      strategy: transcript.duration > CHUNK_THRESHOLD_SECS ? "chunks" : "single",
    },
    "Analyzing transcript for viral moments (Ollama)",
  );

  const allClips =
    transcript.duration > CHUNK_THRESHOLD_SECS
      ? await analyzeInChunks(transcript, videoTitle, channelName, config, maxCuts)
      : await analyzeSingle(transcript, videoTitle, channelName, config, minCuts, maxCuts);

  return processClips(allClips, transcript, config, maxCuts);
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
  const model = createOllamaModel(config);

  const { text } = await generateText({ model, prompt, temperature: 0.5, maxTokens });
  const parsed = extractAndParseJSON(text);
  if (!parsed) {
    logger.warn({ videoId: transcript.videoId, rawResponse: text.slice(0, 500) }, "LLM returned invalid JSON, retrying once...");
    const { text: retryText } = await generateText({
      model,
      prompt: prompt + "\n\nIMPORTANT: Respond ONLY with valid JSON. No markdown, no explanation.",
      temperature: 0.2,
      maxTokens,
    });
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
  logger.info({ videoId: transcript.videoId, chunks: chunks.length }, "Analyzing in chunks");

  const allClips: z.infer<typeof ClipSchema>["clips"] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkStart = chunk[0].start;
    const chunkEnd = chunk[chunk.length - 1].end;
    const formatted = formatTranscriptForLLM(chunk);
    const prompt = buildChunkPrompt(formatted, videoTitle, channelName, chunkStart, chunkEnd, config);
    const model = createOllamaModel(config);

    logger.info(
      { videoId: transcript.videoId, chunk: i + 1, total: chunks.length, chunkStart: formatTime(chunkStart), chunkEnd: formatTime(chunkEnd) },
      "Analyzing chunk",
    );

    try {
      const { text } = await generateText({ model, prompt, temperature: 0.4, maxTokens: TOKENS_PER_CLIP + 100 });
      const parsed = extractAndParseJSON(text);
      if (parsed?.clips.length) allClips.push(...parsed.clips);
    } catch (err) {
      logger.warn({ videoId: transcript.videoId, chunk: i + 1, err }, "Chunk analysis failed, skipping");
    }
  }

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
  })(config.ollamaModel, { structuredOutputs: false });
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
  return `You are a viral content expert for YouTube Shorts targeting Brazilian audience (PT-BR).
Analyze this transcript segment (${formatTime(chunkStart)} to ${formatTime(chunkEnd)}) and find AT MOST 1 viral moment.

Video: "${videoTitle}" by ${channelName}

Rules:
- Find 0 or 1 clip. Only include a clip if it is genuinely viral-worthy.
- Clip duration: ${config.minShortDuration}–${config.maxShortDuration} seconds
- Start/end at sentence boundaries (never mid-sentence)
- Title must be viral, punchy, in PT-BR (max 60 chars)

## Transcript:
${transcript}

Respond ONLY with JSON (no markdown):
{"clips": [{"title": "...", "description": "...", "startTime": 0, "endTime": 0, "viralScore": 1, "reason": "...", "hookLine": "...", "hashtags": ["#tag"]}]}
Or if no good moment: {"clips": []}`;
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
  return `You are an expert in viral content for YouTube Shorts, TikTok and Instagram Reels targeting the Brazilian audience (PT-BR).

Analyze the transcript below and identify the **most viral, highly engaging moments** that are practically guaranteed to perform well.
You must find between **${minClips} and ${maxClips} clips**. Do not generate fewer clips than requested.

## Video Info
- **Title:** ${videoTitle}
- **Channel:** ${channelName}
- **Total duration:** ${formatTime(totalDuration)}

## CRITICAL — Cut Boundaries (HIGHEST PRIORITY):
- NEVER start a clip in the middle of a sentence
- NEVER end a clip in the middle of a sentence
- Each clip MUST start at the BEGINNING of a complete sentence/thought
- Each clip MUST end at the END of a complete sentence/thought
- The viewer must feel that the clip has a clear beginning, development, and conclusion
- Use the transcript timestamps: startTime = segment start, endTime = segment end

## Selection criteria for MAXIMUM VIRALITY:
1. **High Retention Hook** — The very first sentence must be an absolute scroll-stopper (curiosity gap, strong polarizing opinion, or direct question). Focus on shocking statistics, extreme controversy, or dropping a bombshell. Start the clip at the exact moment of peak curiosity. The viewer MUST be compelled to keep watching. Maximize retention at all costs.
2. **Pacing & Energy** — The excerpt must be dense with value, high emotion, or mind-blowing revelations. Cut out ALL boring buildups, pauses, and filler words. The clip must feel relentless.
3. **Self-contained Story/Idea** — It MUST make 100% complete sense to a viewer who has never seen the full video. It should feel like a standalone viral short.
4. **Strong Payoff** — The end of the clip should resolve the hook or deliver a massive punchline/revelation that leaves the viewer desperately wanting more or wanting to share.
5. **Shareability & Controversy** — Does this make someone want to send it to a friend, bookmark it instantly, or aggressively argue in the comments? Maximize engagement!

## Rules:
- You MUST find between **${minClips} and ${maxClips} clips**. If you cannot find perfect clips, lower your standards slightly to meet the count, but try to maintain the highest virality possible.
- Each clip must be between **${minDuration}** and **${maxDuration} seconds**
- Clips must NOT overlap
- startTime and endTime MUST perfectly align with transcript segment boundaries
- Generate extreme, EXTREMELY clickbaity, and punchy titles IN PORTUGUESE (PT-BR) that provoke intense curiosity, urgency, or FOMO. Titles MUST be highly attractive for TikTok/Shorts algorithms, practically forcing the user to click. Emphasize controversy, mind-blowing facts, or highly emotional hooks in the title. The title should be as viral and short as possible.
- If you can identify the name of the priest, pastor, bishop, pope, speaker, or person talking in the video (from the video title, channel name, or the transcript itself), INCLUDE their name in the title. E.g. "Padre Paulo Sérgio: [hook]" or "Dom Bosco explica [topic]".

## Transcript:
${transcript}

## Response format:
Respond ONLY with a JSON object (no markdown, no extra text) in this exact format:
{
  "clips": [
    {
      "title": "Título curto, chamativo e altamente viral em PORTUGUÊS (máx. 60 caracteres)",
      "description": "Descrição curta para engajamento em PORTUGUÊS (máx. 150 caracteres)",
      "startTime": 120.5,
      "endTime": 155.0,
      "viralScore": 8,
      "reason": "Explicação em PORTUGUÊS do porquê este momento tem potencial viral",
      "hookLine": "Frase de gancho/impacto para os primeiros 3 segundos (em PORTUGUÊS)",
      "hashtags": ["#tag1", "#tag2", "#tag3"]
    }
  ]
}

Responda APENAS com o JSON. O idioma deve ser estritamente Português do Brasil (PT-BR).`;
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
    } catch { /* invalid JSON in code block */ }
  }

  const jsonMatch = text.match(/\{[\s\S]*"clips"[\s\S]*\}/);
  if (jsonMatch?.[0]) {
    try {
      const parsed = ClipSchema.safeParse(JSON.parse(jsonMatch[0]));
      if (parsed.success) return parsed.data;
    } catch { /* invalid JSON fragment */ }
  }

  return null;
}

function processClips(
  clips: z.infer<typeof ClipSchema>["clips"],
  transcript: Transcript,
  config: PipelineConfig,
  maxCuts: number,
): ShortClip[] {
  const result: ShortClip[] = clips
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
      if (!ok) {
        logger.debug(
          { title: clip.title, startTime: clip.startTime, endTime: clip.endTime, duration },
          "Clip filtered out",
        );
      }
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

  logger.info(
    {
      videoId: transcript.videoId,
      clipsFound: result.length,
      avgScore: result.length
        ? (result.reduce((s, c) => s + c.viralScore, 0) / result.length).toFixed(1)
        : 0,
    },
    "Analysis complete",
  );

  return result;
}

function formatTranscriptForLLM(segments: TranscriptSegment[]): string {
  return segments
    .map((seg) => `[${formatTime(seg.start)} -> ${formatTime(seg.end)}] ${seg.text}`)
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
