// Measured eases from motionmaxxing (Apache-2.0, runtime/motion.js), as GSAP ease functions.
const guard = f => t => (t <= 0 ? 0 : t >= 1 ? 1 : f(t));
const expoOut = k => { const d = 1 - Math.exp(-k); return t => (1 - Math.exp(-k * t)) / d; };
const spring = (c, om) => {
  const f = t => 1 - Math.exp(-c * t) * (Math.cos(om * t) + (c / om) * Math.sin(om * t));
  const n = f(1);
  return t => f(t) / n;
};
export const softLand = guard(expoOut(3.41)); // 12 frames: text, panels
export const popOver = guard(spring(2.67, 4.36)); // 15 frames, peak 1.08: once per beat
export const accelExit = guard(t => t ** 2.6); // 13 frames: leaving
export const f = n => n / 30; // frames -> seconds at 30 fps
