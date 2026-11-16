// Closing: the state again with this city marked, the question for the comments and the series count.
import { h } from '../engine/dom.js';
import { ease, prog } from '../engine/ease.js';
import { sceneFrame } from './frame.js';
import { stateMap } from './map.js';
import { words, revealWords, rise } from './parts.js';

export default function outro(root, scene, { city, episode }) {
  const f = sceneFrame(root, scene, { titled: false });
  const box = h('div', '', '', root, { position: 'absolute', left: '64px', right: '64px', top: '290px' });
  const l1 = words(box, 'Qual a');
  const l2 = words(box, 'próxima?');
  l2.forEach(s => s.classList.add('acc'));
  const m = stateMap(root, city.map, { top: 620, maxH: 640 });
  const chip = h('div', 'chip', `${episode} de ${city.municipalities} cidades`, root, { position: 'absolute', left: '64px', top: `${m.bottom + 36}px` });

  return (t, dur) => {
    f.tick(t);
    revealWords(l1, t, 0.15);
    revealWords(l2, t, 0.35);
    m.others.style.opacity = ease.outCubic(prog(t, 0.4, 0.7));
    const lit = ease.outExpo(prog(t, 0.9, 0.5));
    m.city.style.opacity = lit;
    const k = 1 + 0.05 * prog(t, 0, dur);
    m.view(k, 0);
    m.pulse(t, k, lit);
    rise(chip, t, 1.2, 0.5, 16);
  };
}
