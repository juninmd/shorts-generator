// Two squares, each one km2: dots are people (one dot = `unit` inhabitants), the city next to the state average.
import { h } from '../engine/dom.js';
import { ease, prog, rand } from '../engine/ease.js';
import { sceneFrame } from './frame.js';
import { rise } from './parts.js';

const GRID = 13; // 169 slots per square
const UNITS = [1, 2, 5, 10, 20, 50, 100, 200, 500];
const fmt = n => n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });

function square(area, left, cls, count, seed) {
  const box = h('div', `km ${cls}`, '', area, { left: `${left}px` });
  // deterministic shuffle of the grid slots, then a small jitter so it reads as people, not a table
  const slots = Array.from({ length: GRID * GRID }, (_, i) => i).sort((a, b) => rand(seed + a) - rand(seed + b));
  const step = 396 / GRID; // 22px inset keeps every dot clear of the border
  return slots.slice(0, count).map(s => h('i', '', '', box, {
    left: `${19 + (s % GRID + 0.5 + (rand(seed + s * 7) - 0.5) * 0.5) * step}px`,
    top: `${19 + (Math.floor(s / GRID) + 0.5 + (rand(seed + s * 13) - 0.5) * 0.5) * step}px`,
  }));
}

export default function density(root, scene) {
  const f = sceneFrame(root, scene);
  const { city, state, cityLabel, stateLabel } = scene.props;
  const unit = UNITS.find(u => Math.max(city, state) / u <= GRID * GRID) ?? 1000;
  const sides = [
    { v: city, label: cityLabel, cls: 'self', left: 0, seed: 11 },
    { v: state, label: stateLabel, cls: '', left: 512, seed: 97 },
  ].map(s => ({
    ...s,
    dots: square(f.area, s.left, s.cls, Math.max(1, Math.round(s.v / unit)), s.seed),
    num: h('div', `kmnum ${s.cls}`, '', f.area, { left: `${s.left}px` }),
    lab: h('div', 'label kmlab', `${s.label} · hab/km²`, f.area, { left: `${s.left}px` }),
  }));
  const legend = h('div', 'label', `1 km² · cada ponto = ${unit} ${unit === 1 ? 'habitante' : 'habitantes'}`, f.area, { position: 'absolute', top: '602px', left: '0' });

  return t => {
    f.tick(t);
    sides.forEach(({ v, dots, num, lab }, i) => {
      const at = 0.8 + i * 0.5;
      const p = ease.outCubic(prog(t, at, 1.6));
      dots.forEach((d, j) => { d.style.transform = `scale(${ease.outBack(prog(t, at + (j / dots.length) * 1.4, 0.3))})`; });
      num.textContent = fmt(p * v);
      rise(num, t, at, 0.5, 16);
      rise(lab, t, at + 0.1, 0.5, 12);
    });
    rise(legend, t, 0.7, 0.5, 12);
  };
}
