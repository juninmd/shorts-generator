import { normalizePath, type QuestionTextFiles } from "./quiz-assets.service.js";
import { buildFrameFilters } from "./quiz-frames.js";
import { TIMER_SECONDS, type Quiz, type QuizTimeline } from "./quiz.domain.js";

export interface FilterResult {
  ffmpegInputs: string[];
  filterComplex: string;
}

export interface QuizFilterAssets {
  bgVideo: string;
  /** The background is a still image (`-loop 1`) rather than a video. */
  bgIsImage?: boolean;
  /** The image already draws its own dark text area, so no panel is painted over it. */
  bgHasPanel?: boolean;
  questionAudioPaths: string[];
  answerAudioPaths: string[];
  outroAudioPath: string;
  fontFile: string;
  textFiles: QuestionTextFiles[];
  outroTxtPath: string;
  outroLinePaths: string[];
  hookTxtPath: string;
  hasMusic: boolean;
  hasBeep: boolean;
  hasLogo: boolean;
  musicPath: string;
  beepPath: string;
  logoPath: string;
  watermarkText: string;
}

/** Beeps sit under the narration; music is a bed, not a competitor. */
const BEEP_VOLUME = 0.35;
const MUSIC_VOLUME = 0.10;
const LIMITER = "alimiter=limit=0.95:level=false";

export const generateFilters = (quiz: Quiz, timeline: QuizTimeline, a: QuizFilterAssets): FilterResult => {
  const isImg = a.bgIsImage ?? Boolean(a.bgVideo.toLowerCase().match(/\.(jpg|png)$/));
  const ffmpegInputs: string[] = [];

  if (isImg) {
    ffmpegInputs.push("-loop", "1", "-framerate", "30", "-i", normalizePath(a.bgVideo));
  } else {
    ffmpegInputs.push("-stream_loop", "-1", "-i", normalizePath(a.bgVideo));
  }

  quiz.perguntas.forEach((_, i) => {
    ffmpegInputs.push("-i", normalizePath(a.questionAudioPaths[i]!), "-i", normalizePath(a.answerAudioPaths[i]!));
  });
  ffmpegInputs.push("-i", normalizePath(a.outroAudioPath));
  const outroIdx = 1 + quiz.perguntas.length * 2;

  let nextInputIdx = outroIdx + 1;
  let beepIdx = -1, musicIdx = -1, logoIdx = -1;
  if (a.hasBeep) { ffmpegInputs.push("-i", normalizePath(a.beepPath)); beepIdx = nextInputIdx++; }
  if (a.hasMusic) { ffmpegInputs.push("-i", normalizePath(a.musicPath)); musicIdx = nextInputIdx++; }
  if (a.hasLogo) { ffmpegInputs.push("-i", normalizePath(a.logoPath)); logoIdx = nextInputIdx++; }

  const filters = buildFrameFilters(quiz, timeline, {
    fontFile: a.fontFile,
    textFiles: a.textFiles,
    outroTxtPath: a.outroTxtPath,
    outroLinePaths: a.outroLinePaths,
    hookTxtPath: a.hookTxtPath,
    hasLogo: a.hasLogo,
    logoIdx,
    watermarkText: a.watermarkText,
    hasPanel: a.bgHasPanel ?? false,
  });

  // Audio: narrations concatenated with silent timer gaps, beeps on top.
  const audioFilters: string[] = [];
  const segments: string[] = [];
  quiz.perguntas.forEach((_, i) => {
    const qIn = 1 + i * 2;
    const aIn = 2 + i * 2;
    audioFilters.push(`[${qIn}:a]aformat=sample_rates=48000:channel_layouts=stereo[nq${i}]`);
    audioFilters.push(`[${aIn}:a]aformat=sample_rates=48000:channel_layouts=stereo[na${i}]`);
    audioFilters.push(`aevalsrc=0:d=${TIMER_SECONDS}:sample_rate=48000,aformat=channel_layouts=stereo[gap${i}]`);
    segments.push(`[nq${i}]`, `[gap${i}]`, `[na${i}]`);
  });
  audioFilters.push(`[${outroIdx}:a]aformat=sample_rates=48000:channel_layouts=stereo,apad=pad_dur=0.6[nout]`);
  segments.push(`[nout]`);
  audioFilters.push(`${segments.join("")}concat=n=${segments.length}:v=0:a=1[voice]`);

  let lastAudioLabel = "[voice]";
  if (a.hasBeep && beepIdx !== -1) {
    const beepCount = quiz.perguntas.length * TIMER_SECONDS;
    audioFilters.push(
      `[${beepIdx}:a]volume=${BEEP_VOLUME},asplit=${beepCount}`
      + Array.from({ length: beepCount }, (_, n) => `[beep${n}]`).join(""),
    );
    let n = 0;
    quiz.perguntas.forEach((_, i) => {
      for (let k = 0; k < TIMER_SECONDS; k++) {
        const d = Math.round((timeline.questions[i]!.timerStart + k) * 1000);
        audioFilters.push(`[beep${n}]adelay=${d}|${d}[b${n}]`);
        audioFilters.push(`${lastAudioLabel}[b${n}]amix=inputs=2:dropout_transition=0:normalize=0[m${n}]`);
        lastAudioLabel = `[m${n}]`;
        n++;
      }
    });
  }

  if (a.hasMusic && musicIdx !== -1) {
    audioFilters.push(`[${musicIdx}:a]aloop=loop=-1:size=2e9,volume=${MUSIC_VOLUME}[bgm]`);
    audioFilters.push(`${lastAudioLabel}[bgm]amix=inputs=2:duration=first:normalize=0,${LIMITER}[aout]`);
  } else {
    // A beep summed over narration can clip; the limiter holds the sum under 0 dBFS.
    audioFilters.push(`${lastAudioLabel}${LIMITER}[aout]`);
  }
  filters.push(audioFilters.join(";"));

  return { ffmpegInputs, filterComplex: filters.join(";") };
};
