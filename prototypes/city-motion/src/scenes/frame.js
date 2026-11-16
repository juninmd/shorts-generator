import { h } from '../engine/dom.js';
import { words, revealWords, fade, rise } from './parts.js';
import { captions } from './captions.js';

const POS = { position: 'absolute', left: '64px', right: '64px' };
// uppercase Poppins ExtraBold averages ~0.76em per character; shrink so the longest line fits 952px
export const fitSize = (text, max, width = 940) => Math.min(max, Math.floor(width / (text.length * 0.76)));

// Shared chrome of every scene: kicker + two-line headline (optional), the free `area` (952x640),
// the spoken-word captions and the source note. Call `tick(t)` first in the scene's update.
export function sceneFrame(root, scene, { titled = true } = {}) {
  let kicker = null;
  let lines = [];
  if (titled) {
    kicker = h('div', 'kicker', scene.kicker, root, { left: '64px', top: '280px' });
    const size = fitSize(scene.title.reduce((a, b) => (a.length > b.length ? a : b)), 112);
    const box = h('div', '', '', root, { ...POS, top: '340px', fontSize: `${size}px` });
    lines = scene.title.map((txt, i) => {
      const spans = words(box, txt, 'title');
      spans.forEach(s => { s.parentElement.style.fontSize = 'inherit'; });
      if (i === scene.title.length - 1) spans.forEach(s => s.classList.add('acc'));
      return spans;
    });
  }
  const area = h('div', '', '', root, { ...POS, top: '670px', height: '640px' });
  const src = h('div', 'source', scene.source, root, { ...POS, top: '1620px' });
  const cap = captions(root, scene);

  return {
    area,
    tick(t) {
      if (kicker) rise(kicker, t, 0.05, 0.5, 16);
      lines.forEach((spans, i) => revealWords(spans, t, 0.15 + i * 0.2));
      fade(src, t, 0.6);
      cap(t);
    },
  };
}
