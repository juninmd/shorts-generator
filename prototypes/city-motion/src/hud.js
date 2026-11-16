import { h } from './engine/dom.js';

// Persistent overlay: series tag, episode label, progress bar. All driven by t.
export function buildHud(stage, _meta, labels) {
  const hud = h('div', 'hud', '', stage);
  h('div', 'chip series', labels.topLeft, hud);
  h('div', 'label ep', labels.topRight, hud);
  const fill = h('i', '', '', h('div', 'bar', '', hud));

  return function update(t, duration) {
    fill.style.transform = `scaleX(${t / duration})`;
    stage.style.setProperty('--gy', `${(t * 12) % 54}px`);
  };
}
