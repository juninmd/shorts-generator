import type { ComicChapter, NarratedChapter } from "../comic/comic-types.js";
import { narrateChapter } from "../comic/comic-tts.js";
import { logger } from "../logger.js";
import { elevenLabsNarrate, type ElevenLabsOptions } from "./elevenlabs.js";
import { silentNarration } from "./silent-narration.js";

export type VoiceProvider = "elevenlabs" | "kokoro" | "edge" | "silent";

export interface NarrationConfig {
  provider: VoiceProvider;
  edgeVoice: string;
  /** Present only when both ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID are set. */
  elevenLabs?: ElevenLabsOptions;
}

const PROVIDERS: readonly VoiceProvider[] = ["elevenlabs", "kokoro", "edge", "silent"];

/** Reads ANIMATED_VOICE; otherwise ElevenLabs (key + voice id), then Kokoro (KOKORO_MODEL_DIR), else edge-tts. */
export function resolveNarrationConfig(env: NodeJS.ProcessEnv): NarrationConfig {
  const requested = env.ANIMATED_VOICE?.trim().toLowerCase() as VoiceProvider | undefined;
  const hasElevenLabs = Boolean(env.ELEVENLABS_API_KEY && env.ELEVENLABS_VOICE_ID);
  const provider: VoiceProvider =
    requested && PROVIDERS.includes(requested)
      ? requested
      : hasElevenLabs
        ? "elevenlabs"
        : env.KOKORO_MODEL_DIR
          ? "kokoro"
          : "edge";
  return {
    provider,
    edgeVoice: env.COMIC_TTS_VOICE || "pt-BR-AntonioNeural",
    elevenLabs: hasElevenLabs
      ? {
          apiKey: env.ELEVENLABS_API_KEY as string,
          voiceId: env.ELEVENLABS_VOICE_ID as string,
          modelId: env.ELEVENLABS_MODEL || "eleven_multilingual_v2",
        }
      : undefined,
  };
}

/** Providers tried in order; the last one (silent) cannot fail, so it is the guaranteed floor. */
export function narrationChain(provider: VoiceProvider): VoiceProvider[] {
  if (provider === "elevenlabs") return ["elevenlabs", "edge", "silent"];
  if (provider === "kokoro") return ["kokoro", "silent"];
  if (provider === "edge") return ["edge", "silent"];
  return ["silent"];
}

async function narrateWith(
  provider: VoiceProvider,
  chapter: ComicChapter,
  outputDir: string,
  config: NarrationConfig,
): Promise<NarratedChapter> {
  if (provider === "elevenlabs") {
    if (!config.elevenLabs) throw new Error("ElevenLabs is not configured");
    return elevenLabsNarrate(chapter, outputDir, config.elevenLabs);
  }
  if (provider === "kokoro") return narrateChapter(chapter, outputDir, config.edgeVoice, "kokoro");
  if (provider === "edge") return narrateChapter(chapter, outputDir, config.edgeVoice, "edge");
  return silentNarration(chapter);
}

/** Narrates one chapter, logging and falling back to the next provider when one fails. */
async function narrateFrom(
  chain: VoiceProvider[],
  chapter: ComicChapter,
  outputDir: string,
  config: NarrationConfig,
): Promise<{ narrated: NarratedChapter; used: number }> {
  for (let i = 0; i < chain.length - 1; i++) {
    try {
      return { narrated: await narrateWith(chain[i] as VoiceProvider, chapter, outputDir, config), used: i };
    } catch (err) {
      logger.warn(
        { chapterId: chapter.id, provider: chain[i], error: (err as Error).message },
        "Narration provider failed, falling back",
      );
    }
  }
  const last = chain.length - 1;
  return { narrated: await narrateWith(chain[last] as VoiceProvider, chapter, outputDir, config), used: last };
}

export async function narrateWithFallback(
  chapter: ComicChapter,
  outputDir: string,
  config: NarrationConfig,
): Promise<NarratedChapter> {
  return (await narrateFrom(narrationChain(config.provider), chapter, outputDir, config)).narrated;
}

/** Once a provider fails for one chapter, the rest of the run stays on the fallback, so voices never mix. */
export async function narrateAnimatedChapters(
  chapters: ComicChapter[],
  outputDir: string,
  config: NarrationConfig,
): Promise<NarratedChapter[]> {
  let chain = narrationChain(config.provider);
  const result: NarratedChapter[] = [];
  for (const chapter of chapters) {
    const { narrated, used } = await narrateFrom(chain, chapter, outputDir, config);
    chain = chain.slice(used);
    result.push(narrated);
  }
  return result;
}
