import fs from "node:fs";
import path from "node:path";
import { buildSpeechAudioFilter } from "./audio-polish.js";
import { AUDIO_SAMPLE_RATE } from "./encode-settings.js";

const MUSIC_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"]);

/**
 * Background track for a short: BGM_FILE, or a random audio file from BGM_DIR
 * (royalty-free music you supply). Returns null when none is configured, so
 * shorts stay speech-only by default.
 */
export function pickBackgroundMusic(): string | null {
  const file = process.env.BGM_FILE;
  if (file) return fs.existsSync(file) ? file : null;
  const dir = process.env.BGM_DIR;
  if (!dir || !fs.existsSync(dir)) return null;
  const tracks = fs.readdirSync(dir)
    .filter((name) => MUSIC_EXTENSIONS.has(path.extname(name).toLowerCase()));
  if (tracks.length === 0) return null;
  return path.join(dir, tracks[Math.floor(Math.random() * tracks.length)]!);
}

export interface DuckingOptions {
  speechInput: string;
  musicInput: string;
  duration: number;
  /** Filter chain applied to the speech before mixing; defaults to a no-op. */
  speechFilter?: string;
}

/**
 * Filtergraph mixing speech over background music that "ducks": the music is
 * sidechain-compressed by the speech, dropping while someone talks and swelling
 * back in the gaps. Fades the music in/out and limits the sum. Output: [aout].
 * Everything is resampled to the 48 kHz the delivery spec asks for.
 */
export function buildDuckingGraph(options: DuckingOptions): string {
  const volume = Number.parseFloat(process.env.BGM_VOLUME ?? "") || 0.18;
  const fadeOutStart = Math.max(0, options.duration - 1.5).toFixed(2);
  return [
    `${options.speechInput}${options.speechFilter ?? "anull"},aresample=${AUDIO_SAMPLE_RATE},asplit=2[duck_sp][duck_sc]`,
    `${options.musicInput}aresample=${AUDIO_SAMPLE_RATE},volume=${volume},afade=t=in:d=1,afade=t=out:st=${fadeOutStart}:d=1.5[duck_bg]`,
    "[duck_bg][duck_sc]sidechaincompress=threshold=0.04:ratio=10:attack=15:release=350[duck_low]",
    "[duck_sp][duck_low]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95[aout]",
  ].join(";");
}

export interface AudioRouting {
  /** Extra ffmpeg inputs (the looped music track), placed after the video inputs. */
  inputArgs: string[];
  /** Filtergraph fragment to append to -filter_complex ("" without music). */
  graph: string;
  /** -map/-af arguments selecting the final audio. */
  outputArgs: string[];
}

/** Speech-only audio, or speech ducked under music when a track is available. */
export function buildAudioRouting(
  duration: number,
  musicPath: string | null,
  musicInputIndex: number,
  speechInput = "[0:a]",
): AudioRouting {
  const speechFilter = buildSpeechAudioFilter(duration);
  if (!musicPath) {
    // Silence-cut audio arrives as a filtergraph label, so it must stay in the graph.
    return speechInput === "[0:a]"
      ? { inputArgs: [], graph: "", outputArgs: ["-map", "0:a?", "-af", speechFilter] }
      : { inputArgs: [], graph: `${speechInput}${speechFilter}[aout]`, outputArgs: ["-map", "[aout]"] };
  }
  return {
    inputArgs: ["-stream_loop", "-1", "-i", musicPath],
    graph: buildDuckingGraph({
      speechInput,
      musicInput: `[${musicInputIndex}:a]`,
      duration,
      speechFilter,
    }),
    outputArgs: ["-map", "[aout]"],
  };
}
