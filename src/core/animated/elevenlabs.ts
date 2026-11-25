import fs from "node:fs";
import path from "node:path";
import type { TranscriptWord } from "../../types.js";
import type { ComicChapter, NarratedChapter } from "../comic/comic-types.js";
import { getVideoDuration } from "../video-processor.js";

export interface ElevenLabsOptions {
  apiKey: string;
  voiceId: string;
  modelId: string;
}

/** Per-character timings returned by ElevenLabs' `with-timestamps` endpoint. */
export interface Alignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

const TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech";

/** Groups per-character timings into whitespace-separated word timings. */
export function alignmentToWords(alignment: Alignment): TranscriptWord[] {
  const words: TranscriptWord[] = [];
  let current: TranscriptWord | null = null;
  for (let i = 0; i < alignment.characters.length; i++) {
    const ch = alignment.characters[i] as string;
    if (/\s/.test(ch)) {
      if (current) words.push(current);
      current = null;
      continue;
    }
    const start = alignment.character_start_times_seconds[i] as number;
    const end = alignment.character_end_times_seconds[i] as number;
    if (current) {
      current.word += ch;
      current.end = end;
    } else {
      current = { word: ch, start, end };
    }
  }
  if (current) words.push(current);
  return words;
}

/**
 * Synthesize one chapter with ElevenLabs and return its audio plus word timings.
 * Errors name the HTTP status only, never the request, so the API key cannot leak into logs.
 */
export async function elevenLabsNarrate(
  chapter: ComicChapter,
  outputDir: string,
  options: ElevenLabsOptions,
): Promise<NarratedChapter> {
  const response = await fetch(
    `${TTS_URL}/${encodeURIComponent(options.voiceId)}/with-timestamps?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": options.apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ text: chapter.narrationText, model_id: options.modelId }),
      signal: AbortSignal.timeout(120_000),
    },
  );
  if (!response.ok) {
    throw new Error(`ElevenLabs request failed with HTTP ${response.status}`);
  }
  const body = (await response.json()) as { audio_base64: string; alignment: Alignment | null };
  if (!body.alignment || body.alignment.characters.length !== body.alignment.character_start_times_seconds.length) {
    throw new Error("ElevenLabs returned no usable word alignment");
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const audioPath = path.join(outputDir, `${chapter.id}.mp3`);
  fs.writeFileSync(audioPath, Buffer.from(body.audio_base64, "base64"));
  const durationSec = await getVideoDuration(audioPath);
  return { ...chapter, audioPath, durationSec, words: alignmentToWords(body.alignment) };
}
