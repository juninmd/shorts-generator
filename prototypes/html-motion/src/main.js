// Builds the composition from window.__PLAN (injected by the renderer). Every frame is a pure
// function of t: GSAP timeline is paused and seeked, three.js and captions are drawn from t.
import * as THREE from 'three';
import { accelExit, f, popOver, softLand } from './eases.js';

const plan = window.__PLAN;
const root = document.getElementById('root');
root.dataset.duration = String(plan.duration);
gsap.ticker.lagSmoothing(0);
gsap.ticker.sleep(); // no wall clock: only seek() moves time
gsap.defaults({ lazy: false });

const el = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls, textContent: text ?? '' });
const tl = gsap.timeline({ paused: true });
for (const s of plan.scenes) {
  const node = el('div', 'scene');
  if (s.kicker) node.append(el('div', 'kicker', s.kicker));
  const year = s.year ? node.appendChild(el('div', 'year', String(s.year))) : null;
  node.append(el('div', 'title', s.title));
  if (s.body) node.append(el('div', 'body', s.body));
  document.getElementById('scenes').append(node);
  const parts = [...node.children];
  tl.set(node, { visibility: 'visible' }, s.start);
  tl.fromTo(parts, { y: 90, opacity: 0 }, { y: 0, opacity: 1, duration: f(12), ease: softLand, stagger: f(3) }, s.start);
  if (year) {
    const from = { v: s.year - 30 };
    tl.to(from, { v: s.year, duration: f(18), ease: softLand, onUpdate: () => { year.textContent = String(Math.round(from.v)); } }, s.start);
  }
  if (s !== plan.scenes.at(-1)) {
    tl.to(parts, { y: -60, opacity: 0, duration: f(9), ease: accelExit, stagger: f(1) }, s.end - f(9));
    tl.set(node, { visibility: 'hidden' }, s.end);
  }
}
tl.fromTo('#progress i', { scaleX: 0 }, { scaleX: 1, duration: plan.duration, ease: 'none' }, 0);

// three.js: a slowly turning wireframe "model" that pops once on every scene change.
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gl'), antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(plan.width, plan.height, false);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, plan.width / plan.height, 0.1, 100);
const geo = new THREE.IcosahedronGeometry(2.4, 2);
const mesh = new THREE.Group();
mesh.add(new THREE.LineSegments(new THREE.WireframeGeometry(geo), new THREE.LineBasicMaterial({ color: 0x3b4659 })));
mesh.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x4cc2ff, size: 0.09 })));
scene.add(mesh);

function draw3d(t) {
  const since = Math.max(0, ...plan.scenes.map(s => s.start).filter(st => st <= t).map(st => t - st));
  const pop = since < f(15) ? popOver(since / f(15)) : 1;
  mesh.scale.setScalar(0.92 + 0.08 * pop);
  mesh.rotation.set(0.35 + 0.08 * Math.sin(t * 0.4), t * 0.22, 0);
  mesh.position.y = -2.6;
  camera.position.set(0, 0, 13 - 2.2 * (t / plan.duration)); // slow push-in over the whole short
  renderer.render(scene, camera);
}

const caption = document.getElementById('caption');
function drawCaption(t) {
  const page = plan.captions.find(p => t >= p.start - 0.05 && t < p.end + 0.25);
  caption.innerHTML = '';
  if (!page) return;
  const box = el('span', 'page');
  const current = page.words.findLastIndex(w => t >= w.start); // only the word being spoken lights up
  page.words.forEach((w, i) => {
    if (i) box.append(' ');
    box.append(el('b', i === current ? 'on' : '', w.word));
  });
  caption.append(box);
}

window.__timelines = { main: tl };
window.__hf = {
  duration: plan.duration,
  seek(t) { tl.seek(t, false); draw3d(t); drawCaption(t); },
};
document.fonts.ready.then(() => { window.__hf.seek(0); window.__ready = true; });
