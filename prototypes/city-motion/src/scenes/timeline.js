// Dated milestones (props.stops: [{ year, label }], 2-4 of them); each one lands when the narration says its year.
import { h } from '../engine/dom.js';
import { ease, prog, lerp } from '../engine/ease.js';
import { sceneFrame } from './frame.js';
import { cue } from './captions.js';

export default function timeline(root, scene) {
  const f = sceneFrame(root, scene);
  const { stops } = scene.props;
  const rowH = 640 / stops.length;
  const yearSize = Math.min(124, rowH * 0.62);
  const rail = h('div', 'rail', '', f.area, { top: `${rowH / 2}px`, height: `${rowH * (stops.length - 1)}px` });
  const rows = stops.map((s, i) => {
    const row = h('div', 'stop', '', f.area, { top: `${i * rowH}px`, height: `${rowH}px` });
    const dot = h('div', 'dot', '', row);
    const year = h('div', 'year', String(s.year), row, { fontSize: `${yearSize}px`, top: `${(rowH - yearSize) / 2}px` });
    const what = h('div', 'what', s.label, row);
    return { dot, year, what, at: cue(scene, s.year, 0.8 + i * 1.2) - 0.15 };
  });

  return t => {
    f.tick(t);
    const last = rows.at(-1).at;
    rail.style.transform = `scaleY(${ease.inOutCubic(prog(t, rows[0].at, Math.max(0.5, last - rows[0].at + 0.3)))})`;
    rows.forEach(({ dot, year, what, at }) => {
      const p = ease.outExpo(prog(t, at, 0.6));
      dot.style.transform = `scale(${ease.outBack(prog(t, at, 0.4))})`;
      year.style.opacity = p;
      year.style.transform = `translateX(${lerp(-40, 0, p)}px)`;
      const q = ease.outExpo(prog(t, at + 0.15, 0.6));
      what.style.opacity = q;
      what.style.transform = `translate(${lerp(30, 0, q)}px, -50%)`;
    });
  };
}
