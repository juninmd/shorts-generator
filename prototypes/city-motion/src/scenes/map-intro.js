// Opening: the whole state, the city lights up, the camera pushes in and the name lands.
import { h } from '../engine/dom.js';
import { ease, prog, lerp, clamp } from '../engine/ease.js';
import { sceneFrame, fitSize } from './frame.js';
import { stateMap } from './map.js';
import { rise } from './parts.js';

export default function mapIntro(root, scene, { city }) {
  const f = sceneFrame(root, scene, { titled: false });
  const m = stateMap(root, city.map, { top: 330 });
  const zoom = clamp(170 / city.map.size, 1.6, 6);
  const sub = h('div', 'kicker', `${city.state.name} · ${city.municipalities} municípios`, root, { left: '64px', top: `${m.bottom + 40}px` });
  const name = h('div', 'cityname', '', root, { top: `${m.bottom + 96}px`, fontSize: `${fitSize(city.name, 190)}px` });
  const letters = [...city.name].map(ch => h('span', 'w', ch, name));

  return (t, dur) => {
    f.tick(t);
    m.others.style.opacity = 1; // frame 0 is the thumbnail: map and name are already on screen
    const lit = ease.outExpo(prog(t, 0.3, 0.5));
    m.city.style.opacity = lit;
    const p = ease.inOutCubic(prog(t, 1.3, 1.7));
    const k = lerp(1, zoom, p) * (1 + 0.06 * prog(t, 3, dur)); // slow push after the zoom so the hold is never frozen
    m.view(k, p);
    m.pulse(t, k, lit);
    rise(sub, t, -0.5, 0.5, 16);
    letters.forEach((s, i) => {
      const q = ease.outExpo(prog(t, -1 + i * 0.05, 0.6));
      s.style.opacity = q;
      s.style.transform = `translateY(${lerp(60, 0, q)}px)`;
    });
  };
}
