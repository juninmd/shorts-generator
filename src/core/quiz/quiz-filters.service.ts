import { esc, normalizePath, type QuestionTextFiles } from "./quiz-assets.service.js";
import { TIMER_SECONDS, type Quiz, type QuizTimeline } from "./quiz.domain.js";

export interface FilterResult {
  ffmpegInputs: string[];
  filterComplex: string;
}

export interface QuizFilterAssets {
  bgVideo: string;
  questionAudioPaths: string[];
  answerAudioPaths: string[];
  outroAudioPath: string;
  fontFile: string;
  textFiles: QuestionTextFiles[];
  outroTxtPath: string;
  hookTxtPath: string;
  hasMusic: boolean;
  hasBeep: boolean;
  hasLogo: boolean;
  musicPath: string;
  beepPath: string;
  logoPath: string;
  watermarkText: string;
}

const OPTION_Y: Record<string, number> = { A: 820, B: 1040, C: 1260, D: 1480 };

export const generateFilters = (quiz: Quiz, timeline: QuizTimeline, a: QuizFilterAssets): FilterResult => {
  const isImg = a.bgVideo.toLowerCase().match(/\.(jpg|png)$/);
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

  const filters: string[] = [];
  filters.push(`[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920[vbg]`);

  let vC = "vbg";
  let vI = 1;
  const draw = (spec: string) => {
    filters.push(`[${vC}]${spec}[v${vI}]`);
    vC = `v${vI++}`;
  };
  const t = (s: number) => s.toFixed(2);

  if (a.hasLogo && logoIdx !== -1) {
    filters.push(`[${logoIdx}:v]scale=150:-1[logo_scaled]`);
    filters.push(`[${vC}][logo_scaled]overlay=40:40[vlogo]`);
    vC = "vlogo";
    draw(`drawtext=text='${a.watermarkText}':fontfile='${a.fontFile}':fontcolor=white:fontsize=35:x=200:y=100:bordercolor=black:borderw=2`);
  } else {
    draw(`drawtext=text='${a.watermarkText}':fontfile='${a.fontFile}':fontcolor=white:fontsize=35:x=40:y=40:bordercolor=black:borderw=2`);
  }

  // Hook headline during the whole first question — the swipe decision window.
  const firstReveal = timeline.questions[0]!.revealStart;
  draw(`drawtext=textfile='${esc(a.hookTxtPath)}':expansion=none:fontfile='${a.fontFile}':fontcolor=yellow:fontsize=64:x=(w-text_w)/2:y=200:bordercolor=black:borderw=4:enable='between(t,0,${t(firstReveal)})'`);

  quiz.perguntas.forEach((question, i) => {
    const s = timeline.questions[i]!;
    const files = a.textFiles[i]!;
    const blockEnd = i + 1 < quiz.perguntas.length ? timeline.questions[i + 1]!.qStart : timeline.outroStart;
    const correct = question.resposta_correta;

    draw(`drawtext=text='PERGUNTA ${i + 1}/${quiz.perguntas.length}':fontfile='${a.fontFile}':fontcolor=white:fontsize=38:x=(w-text_w)/2:y=330:bordercolor=black:borderw=3:enable='between(t,${t(s.qStart)},${t(blockEnd)})'`);
    draw(`drawtext=textfile='${esc(files.qTxtPath)}':fontfile='${a.fontFile}':fontcolor=white:fontsize=55:x=(w-text_w)/2:y=430:bordercolor=black:borderw=4:line_spacing=10:enable='between(t,${t(s.qStart)},${t(blockEnd)})'`);

    for (const opt of ["A", "B", "C", "D"] as const) {
      const optFile = files.optTxtPaths[opt];
      if (!optFile) continue;
      if (opt === correct) {
        draw(`drawtext=textfile='${esc(optFile)}':fontfile='${a.fontFile}':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=${OPTION_Y[opt]}:bordercolor=black:borderw=3:enable='between(t,${t(s.qStart)},${t(s.revealStart)})'`);
        draw(`drawtext=textfile='${esc(optFile)}':fontfile='${a.fontFile}':fontcolor=green:fontsize=48:x=(w-text_w)/2:y=${OPTION_Y[opt]}:bordercolor=black:borderw=3:box=1:boxcolor=yellow@0.8:boxborderw=10:enable='between(t,${t(s.revealStart)},${t(blockEnd)})'`);
      } else {
        draw(`drawtext=textfile='${esc(optFile)}':fontfile='${a.fontFile}':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=${OPTION_Y[opt]}:bordercolor=black:borderw=3:enable='between(t,${t(s.qStart)},${t(blockEnd)})'`);
      }
    }

    for (let k = 0; k < TIMER_SECONDS; k++) {
      draw(`drawtext=text='${TIMER_SECONDS - k}':fontfile='${a.fontFile}':fontcolor=yellow:fontsize=110:x=(w-text_w)/2:y=610:bordercolor=black:borderw=5:enable='between(t,${t(s.timerStart + k)},${t(s.timerStart + k + 1)})'`);
    }
  });

  // Outro: curious fact + comment CTA (comments are the satisfaction signal).
  const o = t(timeline.outroStart);
  draw(`drawtext=textfile='${esc(a.outroTxtPath)}':fontfile='${a.fontFile}':fontcolor=white:fontsize=52:x=(w-text_w)/2:y=500:bordercolor=black:borderw=4:line_spacing=10:enable='gte(t,${o})'`);
  draw(`drawtext=text='COMENTA quantas você acertou!':fontfile='${a.fontFile}':fontcolor=yellow:fontsize=54:x=(w-text_w)/2:y=980:bordercolor=black:borderw=4:enable='gte(t,${o})'`);
  draw(`drawtext=text='E se inscreve para o próximo!':fontfile='${a.fontFile}':fontcolor=white:fontsize=42:x=(w-text_w)/2:y=1080:bordercolor=black:borderw=3:enable='gte(t,${o})'`);

  filters.push(`[${vC}]copy[vout]`);

  // Audio: narrations concatenated with silent timer gaps, beeps on top.
  const audioFilters: string[] = [];
  const segments: string[] = [];
  quiz.perguntas.forEach((_, i) => {
    const qIn = 1 + i * 2;
    const aIn = 2 + i * 2;
    audioFilters.push(`[${qIn}:a]aformat=sample_rates=44100:channel_layouts=stereo[nq${i}]`);
    audioFilters.push(`[${aIn}:a]aformat=sample_rates=44100:channel_layouts=stereo[na${i}]`);
    audioFilters.push(`aevalsrc=0:d=${TIMER_SECONDS}:sample_rate=44100,aformat=channel_layouts=stereo[gap${i}]`);
    segments.push(`[nq${i}]`, `[gap${i}]`, `[na${i}]`);
  });
  audioFilters.push(`[${outroIdx}:a]aformat=sample_rates=44100:channel_layouts=stereo,apad=pad_dur=0.6[nout]`);
  segments.push(`[nout]`);
  audioFilters.push(`${segments.join("")}concat=n=${segments.length}:v=0:a=1[voice]`);

  let lastAudioLabel = "[voice]";
  if (a.hasBeep && beepIdx !== -1) {
    const beepCount = quiz.perguntas.length * TIMER_SECONDS;
    audioFilters.push(`[${beepIdx}:a]asplit=${beepCount}${Array.from({ length: beepCount }, (_, n) => `[beep${n}]`).join("")}`);
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
    audioFilters.push(`[${musicIdx}:a]aloop=loop=-1:size=2e9,volume=0.08[bgm]`);
    audioFilters.push(`${lastAudioLabel}[bgm]amix=inputs=2:duration=first:normalize=0[aout]`);
  } else {
    audioFilters.push(`${lastAudioLabel}volume=1.0[aout]`);
  }
  filters.push(audioFilters.join(";"));

  return { ffmpegInputs, filterComplex: filters.join(";") };
};
