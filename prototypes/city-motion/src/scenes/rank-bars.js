// Where the city stands: the state's top municipalities on one linear scale (props.rows: [{ name, value, self }]).
import { h } from '../engine/dom.js';
import { ease, prog } from '../engine/ease.js';
import { sceneFrame } from './frame.js';
import { rise } from './parts.js';

export default function rankBars(root, scene, { city }) {
  const f = sceneFrame(root, scene);
  const { rows, rank, of } = scene.props;
  // a city outside the top 5 takes the last row, keeping its real position number
  const self = { name: city.name, value: scene.props.selfValue, self: true, pos: rank };
  const list = rows.some(r => r.self) ? rows.map((r, i) => ({ ...r, pos: i + 1 })) : [...rows.slice(0, 4).map((r, i) => ({ ...r, pos: i + 1 })), self];
  const max = list[0].value;
  const items = list.map((r, i) => {
    const row = h('div', `rrow${r.self ? ' self' : ''}`, '', f.area, { top: `${i * 122}px` });
    h('div', 'pos', `${r.pos}º`, row);
    h('div', 'name', r.name, row);
    const val = h('div', 'val', '', row);
    const bar = h('i', '', '', h('div', 'track', '', row));
    return { row, val, bar, r };
  });
  h('div', 'label', `entre ${of} municípios`, f.area, { position: 'absolute', top: '612px', left: '84px' });

  return t => {
    f.tick(t);
    items.forEach(({ row, val, bar, r }, i) => {
      const at = 0.7 + i * 0.16;
      rise(row, t, at, 0.5, 24);
      const p = ease.outCubic(prog(t, at + 0.1, 1.1));
      bar.style.transform = `scaleX(${p * r.value / max})`;
      val.textContent = Math.round(p * r.value).toLocaleString('pt-BR');
    });
  };
}
