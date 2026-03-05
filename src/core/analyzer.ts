import { generateText } from "ai";
import { ollama } from "ollama-ai-provider";
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
import { snapToSentenceBoundaries } from "./clip-boundary";

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

/**
 * Analyze transcript using Ollama (local LLM) to identify the best moments for shorts.
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
      model: config.ollamaModel,
    },
    "Analyzing transcript for viral moments (Ollama)",
  );

  // Format transcript with timestamps for the LLM
  const formattedTranscript = formatTranscriptForLLM(transcript.segments);

  const prompt = buildAnalysisPrompt(
    formattedTranscript,
    videoTitle,
    channelName,
    maxCuts,
    config.minShortDuration,
    config.maxShortDuration,
    transcript.duration,
  );

  const model = ollama(config.ollamaModel, {
    structuredOutputs: false,
  });

  // Use generateText + manual JSON parsing for maximum compatibility with small models
  const { text } = await generateText({
    model,
    prompt,
    temperature: 0.7,
    maxTokens: 4096,
  });

  // Extract JSON from the response (handle markdown code blocks)
  const parsed = extractAndParseJSON(text);

  if (!parsed) {
    logger.warn({ videoId: transcript.videoId, rawResponse: text.slice(0, 500) }, "LLM returned invalid JSON, retrying once...");

    // Single retry with stricter prompt
    const { text: retryText } = await generateText({
      model,
      prompt: prompt + "\n\nIMPORTANT: Respond ONLY with valid JSON. No markdown, no explanation. Just the JSON object.",
      temperature: 0.3,
      maxTokens: 4096,
    });

    const retryParsed = extractAndParseJSON(retryText);
    if (!retryParsed) {
      logger.error({ videoId: transcript.videoId }, "LLM failed to produce valid JSON after retry");
      return [];
    }

    return processClips(retryParsed, transcript, config, maxCuts);
  }

  return processClips(parsed, transcript, config, maxCuts);
}

/**
 * Extract JSON from LLM response, handling markdown code blocks and extra text.
 */
function extractAndParseJSON(text: string): z.infer<typeof ClipSchema> | null {
  try {
    // Try direct parse first
    const direct = ClipSchema.safeParse(JSON.parse(text));
    if (direct.success) return direct.data;
  } catch { /* not pure JSON */ }

  // Try extracting from markdown code block
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch?.[1]) {
    try {
      const parsed = ClipSchema.safeParse(JSON.parse(codeBlockMatch[1]));
      if (parsed.success) return parsed.data;
    } catch { /* invalid JSON in code block */ }
  }

  // Try finding JSON object in text
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
  object: z.infer<typeof ClipSchema>,
  transcript: Transcript,
  config: PipelineConfig,
  maxCuts: number,
): ShortClip[] {
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
    .map((clip) => {
      const snapped = snapToSentenceBoundaries(
        clip, transcript.segments, config,
      );
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
        transcript: getSegmentsInRange(
          transcript.segments, snapped.startTime, snapped.endTime,
        ),
        words: getWordsInRange(
          transcript.words, snapped.startTime, snapped.endTime,
        ),
        hashtags: clip.hashtags,
      };
    });

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
  return `You are an expert in viral content for YouTube Shorts, TikTok and Instagram Reels.

Analyze the transcript below and identify the **best moments** that could generate viral shorts.

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

## Selection criteria:
1. **Self-contained** — the excerpt MUST make complete sense on its own, with a clear beginning and ending
2. **Strong hook** — first 3 seconds must grab attention
3. **Emotion or surprise** — moments that generate reactions
4. **Valuable info** — tips, revelations, surprising data
5. **Shareability** — something people would want to share

## Rules:
- Find at most **${maxClips} clips**
- Each clip must be between **${minDuration}** and **${maxDuration} seconds**
- Clips must NOT overlap
- Prioritize quality over quantity
- startTime and endTime MUST align with transcript segment boundaries
- The conversation in the clip must have a natural beginning and end

## Transcript:
${transcript}

## Response format:
Respond ONLY with a JSON object (no markdown, no extra text) in this exact format:
{
  "clips": [
    {
      "title": "Short catchy title (max 60 chars)",
      "description": "Short description for engagement (max 150 chars)",
      "startTime": 120.5,
      "endTime": 155.0,
      "viralScore": 8,
      "reason": "Why this moment has viral potential",
      "hookLine": "Hook phrase for the first 3 seconds",
      "hashtags": ["#tag1", "#tag2", "#tag3"]
    }
  ]
}

Return the best clips sorted by viral potential (highest score first).`;
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
