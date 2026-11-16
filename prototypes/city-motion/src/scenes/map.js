import { h } from '../engine/dom.js';
import { lerp } from '../engine/ease.js';

const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, cls, parent, attrs = {}) => {
  const el = document.createElementNS(NS, tag);
  el.setAttribute('class', cls);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  parent.append(el);
  return el;
};

// The state with every municipality outlined and the episode's city filled, fitted inside maxW x maxH at `top`.
export function stateMap(root, map, { top, maxW = 952, maxH = 700 }) {
  const k0 = Math.min(maxW / map.w, maxH / map.h);
  const w = map.w * k0;
  const box = h('div', '', '', root, { position: 'absolute', left: `${(1080 - w) / 2}px`, top: `${top}px`, width: `${w}px`, height: `${map.h * k0}px` });
  const svg = svgEl('svg', 'map', box, { viewBox: `0 0 ${map.w} ${map.h}` });
  const g = svgEl('g', '', svg);
  const others = svgEl('path', 'others', g, { d: map.others });
  const city = svgEl('path', 'city', g, { d: map.city });
  const ring = svgEl('circle', 'ring', g, { cx: map.cx, cy: map.cy, r: 1 });

  return {
    bottom: top + map.h * k0,
    others,
    city,
    // p = 0 shows the whole state; p = 1 centres the city at zoom k
    view(k, p) {
      const cx = lerp(map.w / 2, map.cx, p);
      const cy = lerp(map.h / 2, map.cy, p);
      g.setAttribute('transform', `translate(${map.w / 2} ${map.h / 2}) scale(${k}) translate(${-cx} ${-cy})`);
    },
    // radar-style ping around the city, in screen-constant size whatever the zoom
    pulse(t, k, on = 1) {
      const f = (t * 0.9) % 1;
      ring.setAttribute('r', (map.size / 2 + lerp(6, 70, f) / k0 / k));
      ring.style.opacity = on * (1 - f);
    },
  };
}
