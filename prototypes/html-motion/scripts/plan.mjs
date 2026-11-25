// Pure timing: narration durations -> absolute scene windows and word times on one timeline.
export const LEAD_IN = 0.3; // first word lands after the first visual move has started
export const GAP = 0.35; // breath between scenes; the cut happens in the middle of it
export const TAIL = 0.6; // final hold, kept under motionmaxxing's 1.4 s ceiling

export function planTimeline(scenes, narrations, fps = 30) {
  if (scenes.length !== narrations.length) throw new Error('every scene needs one narration');
  let t = LEAD_IN;
  const planned = scenes.map((scene, i) => {
    const { duration, words } = narrations[i];
    const voiceStart = t;
    t += duration + GAP;
    return { ...scene, voiceStart, words: words.map(w => ({ ...w, start: w.start + voiceStart, end: w.end + voiceStart })) };
  });
  // a scene is on screen from half a gap before its voice until half a gap before the next one
  planned.forEach((s, i) => {
    s.start = i === 0 ? 0 : s.voiceStart - GAP / 2;
    s.end = i === planned.length - 1 ? t - GAP + TAIL : planned[i + 1].voiceStart - GAP / 2;
  });
  const duration = Math.ceil(planned.at(-1).end * fps) / fps;
  return { fps, width: 1080, height: 1920, duration, scenes: planned };
}

/** Caption pages of at most `max` words that never cross a scene or a sentence end. */
export function captionPages(scenes, max = 3) {
  const pages = [];
  for (const s of scenes) {
    let page = [];
    for (const w of s.words) {
      page.push(w);
      if (page.length === max || /[.!?,]$/.test(w.word)) { pages.push(page); page = []; }
    }
    if (page.length) pages.push(page);
  }
  return pages.map(words => ({ start: words[0].start, end: words.at(-1).end, words }));
}
