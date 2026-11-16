// One number that matters: counts from props.from (default 0) to props.to while a segmented bar fills.
// props: { to, from?, fromLabel?, decimals?, prefix?, unit, chip, cue? } - cue is the narrated token that triggers the count.
import { h } from '../engine/dom.js';
import { ease, prog, lerp } from '../engine/ease.js';
import { sceneFrame } from './frame.js';
import { cue } from './captions.js';
import { rise } from './parts.js';

const CELLS = 40;

export default function counter(root, scene) {
  const f = sceneFrame(root, scene);
  const { to, from = 0, fromLabel, decimals = 0, prefix, unit, chip } = scene.props;
  const fmt = n => n.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const html = n => (prefix ? `<span class="pre">${prefix}</span>` : '') +
    [...fmt(n)].map(ch => (/\d/.test(ch) ? `<span class="d">${ch}</span>` : ch)).join('');
  // fixed-width digits (0.66em) keep the number from jittering while it counts
  const chars = fmt(to).length + (prefix ? 1.6 : 0);
  const size = Math.min(190, Math.floor(940 / (chars * 0.64)));

  const tag = h('div', 'chip', chip, f.area);
  const num = h('div', 'bignum', '', f.area, { fontSize: `${size}px`, marginTop: '56px' });
  const label = h('div', 'label', unit, f.area, { marginTop: '18px' });
  const grid = h('div', 'cells', '', f.area, { marginTop: '64px' });
  const cells = Array.from({ length: CELLS }, () => h('i', '', '', grid));
  const was = h('div', 'label', fromLabel ?? '', f.area, { marginTop: '22px' });
  const start = from > 0 ? cue(scene, scene.props.cue, 1.2) - 0.25 : 0.9;

  return t => {
    f.tick(t);
    rise(tag, t, 0.5, 0.5, 16);
    rise(num, t, 0.6, 0.5, 24);
    rise(label, t, 0.75, 0.5, 12);
    rise(was, t, 0.9, 0.5, 12);
    const p = ease.outExpo(prog(t, start, 2.2));
    num.innerHTML = html(lerp(from, to, p));
    const lit = Math.max(from > 0 ? 1 : 0, Math.round(p * CELLS));
    cells.forEach((c, i) => c.classList.toggle('on', i < lit && t > 0.9));
  };
}
