import { h } from '../engine/dom.js';
import { ease, prog, lerp } from '../engine/ease.js';

// Split the narration into short on-screen groups: at most 3 words / 16 characters, and never across a pause.
export function groupWords(words, max = 3, maxChars = 16) {
  const groups = [];
  let cur = [];
  for (const w of words) {
    const chars = cur.reduce((n, x) => n + x.word.length + 1, 0);
    if (cur.length && (cur.length >= max || chars + w.word.length > maxChars || w.start - cur.at(-1).end > 0.28)) {
      groups.push(cur);
      cur = [];
    }
    cur.push(w);
  }
  if (cur.length) groups.push(cur);
  return groups;
}

// Local second at which the narration says `token` (e.g. a year), so a visual can land on the word.
export function cue(scene, token, fallback) {
  const hit = token == null ? null : scene.words.find(w => w.word.includes(String(token)));
  return hit ? scene.lead + hit.start : fallback;
}

export function captions(root, scene) {
  const box = h('div', 'cap', '', root);
  const all = groupWords(scene.words);
  const groups = all.map((g, i) => {
    const el = h('div', 'capline', '', box);
    const spans = g.map(w => h('span', 'capw', w.word, el));
    const end = Math.min(all[i + 1]?.[0].start ?? Infinity, g.at(-1).end + 0.5);
    return { el, spans, g, start: g[0].start, end };
  });

  return t => {
    const n = t - scene.lead;
    for (const { el, spans, g, start, end } of groups) {
      const on = n >= start && n < end;
      el.style.visibility = on ? 'visible' : 'hidden';
      if (!on) continue;
      const p = ease.outBack(prog(n, start, 0.16));
      el.style.transform = `translateX(-50%) scale(${lerp(0.86, 1, p)})`;
      const now = g.findLastIndex(w => n >= w.start);
      spans.forEach((s, i) => { s.dataset.s = i < now ? 'done' : i === now ? 'now' : 'next'; });
    }
  };
}
