import { esc, normalizePath } from "./quiz-assets.service.js";
import type { Quiz } from "./quiz.domain.js";

export interface FilterResult {
  ffmpegInputs: string[];
  filterComplex: string;
}

export const generateFilters = (
  quiz: Quiz,
  bgVideo: string,
  qPath: string,
  aPath: string,
  qDur: number,
  fontFile: string,
  qTxtPath: string,
  optTxtPaths: Record<string, string>,
  hasMusic: boolean,
  hasBeep: boolean,
  hasLogo: boolean,
  musicPath: string,
  beepPath: string,
  logoPath: string,
  watermarkText: string = "@akitemquiz"
): FilterResult => {
  const isImg = bgVideo.toLowerCase().match(/\.(jpg|png)$/);
  const ffmpegInputs: string[] = [];

  if (isImg) {
    ffmpegInputs.push("-loop", "1", "-framerate", "30", "-i", normalizePath(bgVideo));
  } else {
    ffmpegInputs.push("-stream_loop", "-1", "-i", normalizePath(bgVideo));
  }

  ffmpegInputs.push("-i", qPath, "-i", aPath);

  let nextInputIdx = 3;
  let beepIdx = -1;
  let musicIdx = -1;
  let logoIdx = -1;

  if (hasBeep) {
    ffmpegInputs.push("-i", normalizePath(beepPath));
    beepIdx = nextInputIdx++;
  }
  if (hasMusic) {
    ffmpegInputs.push("-i", normalizePath(musicPath));
    musicIdx = nextInputIdx++;
  }
  if (hasLogo) {
    ffmpegInputs.push("-i", normalizePath(logoPath));
    logoIdx = nextInputIdx++;
  }

  const filters: string[] = [];
  filters.push(`[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920[vbg]`);

  let vC = "vbg";
  let vI = 1;

  if (hasLogo && logoIdx !== -1) {
    filters.push(`[${logoIdx}:v]scale=150:-1[logo_scaled]`);
    filters.push(`[${vC}][logo_scaled]overlay=40:40[vlogo]`);
    vC = "vlogo";
    filters.push(`[${vC}]drawtext=text='${watermarkText}':fontfile='${fontFile}':fontcolor=white:fontsize=35:x=200:y=100:bordercolor=black:borderw=2[vcanal]`);
    vC = "vcanal";
  } else {
    // Even if no logo is present, draw the channel handle as watermark
    filters.push(`[${vC}]drawtext=text='${watermarkText}':fontfile='${fontFile}':fontcolor=white:fontsize=35:x=40:y=40:bordercolor=black:borderw=2[vcanal]`);
    vC = "vcanal";
  }

  filters.push(`[${vC}]drawtext=textfile='${esc(qTxtPath)}':fontfile='${fontFile}':fontcolor=white:fontsize=55:x=(w-text_w)/2:y=380:bordercolor=black:borderw=4:line_spacing=10[v${vI}]`);
  vC = `v${vI++}`;

  const optY: Record<string, number> = { A: 870, B: 1120, C: 1370, D: 1620 };
  const correct = quiz.resposta_correta as "A" | "B" | "C" | "D";
  const revealTime = qDur + 5;

  for (const opt of ["A", "B", "C", "D"] as const) {
    if (optTxtPaths[opt]) {
      if (opt === correct) {
        filters.push(`[${vC}]drawtext=textfile='${esc(optTxtPaths[opt])}':fontfile='${fontFile}':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=${optY[opt]}:bordercolor=black:borderw=3:enable='lt(t,${revealTime})'[v${vI}]`);
        vC = `v${vI++}`;
        filters.push(`[${vC}]drawtext=textfile='${esc(optTxtPaths[opt])}':fontfile='${fontFile}':fontcolor=green:fontsize=48:x=(w-text_w)/2:y=${optY[opt]}:bordercolor=black:borderw=3:box=1:boxcolor=yellow@0.8:boxborderw=10:enable='gte(t,${revealTime})'[v${vI}]`);
        vC = `v${vI++}`;
      } else {
        filters.push(`[${vC}]drawtext=textfile='${esc(optTxtPaths[opt])}':fontfile='${fontFile}':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=${optY[opt]}:bordercolor=black:borderw=3[v${vI}]`);
        vC = `v${vI++}`;
      }
    }
  }

  for (let i = 0; i < 5; i++) {
    filters.push(`[${vC}]drawtext=text='${5 - i}':fontfile='${fontFile}':fontcolor=yellow:fontsize=150:x=(w-text_w)/2:y=1800:bordercolor=black:borderw=5:enable='between(t,${qDur + i},${qDur + i + 1})'[v${vI}]`);
    vC = `v${vI++}`;
  }

  filters.push(`[${vC}]copy[vout]`);

  let audioFilters: string[] = [];
  audioFilters.push(`[1:a]apad=pad_dur=5[qp]`);
  let lastAudioLabel = "[qp]";

  if (hasBeep && beepIdx !== -1) {
    for (let i = 0; i < 5; i++) {
      const d = Math.round((qDur + i) * 1000);
      const beepLabel = `b${i}`;
      const mixedLabel = `m${i}`;
      audioFilters.push(`[${beepIdx}:a]adelay=${d}|${d}[${beepLabel}]`);
      audioFilters.push(`${lastAudioLabel}[${beepLabel}]amix=inputs=2:dropout_transition=0:normalize=0[${mixedLabel}]`);
      lastAudioLabel = `[${mixedLabel}]`;
    }
  }

  audioFilters.push(`${lastAudioLabel}[2:a]concat=n=2:v=0:a=1[base]`);

  if (hasMusic && musicIdx !== -1) {
    audioFilters.push(`[${musicIdx}:a]aloop=loop=-1:size=2e9,volume=0.1[bgm]`);
    audioFilters.push(`[base][bgm]amix=inputs=2:duration=shortest[aout]`);
  } else {
    audioFilters.push(`[base]volume=1.0[aout]`);
  }
  filters.push(audioFilters.join(";"));

  return { ffmpegInputs, filterComplex: filters.join(";") };
};
