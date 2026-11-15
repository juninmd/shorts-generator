import React from 'react';
import {AbsoluteFill, random, useCurrentFrame} from 'remotion';
import type {Mood} from './backgrounds/types';

interface Look { colors: [string, string, string]; speed: number; particles: number; rise: number; dot: string; grid?: boolean }

export const LOOKS: Record<Mood, Look> = {
  dark: {colors: ['#07070d', '#3a0d1a', '#8a1426'], speed: 0.4, particles: 40, rise: 1.2, dot: '#ff6b3d'},
  energetic: {colors: ['#3a0ca3', '#ff006e', '#ffbe0b'], speed: 1.6, particles: 60, rise: 6, dot: '#ffffff'},
  calm: {colors: ['#03045e', '#0077b6', '#90e0ef'], speed: 0.3, particles: 25, rise: 0.8, dot: '#caf0f8'},
  tech: {colors: ['#000814', '#003566', '#00b4d8'], speed: 0.7, particles: 50, rise: 2, dot: '#48cae4', grid: true},
  history: {colors: ['#1c1208', '#6f4518', '#d4a373'], speed: 0.35, particles: 70, rise: 0.5, dot: '#ffe8c2'},
  neutral: {colors: ['#0d1b2a', '#1b263b', '#415a77'], speed: 0.5, particles: 30, rise: 1, dot: '#e0e1dd'},
};

/** Animated backdrop matched to the scene mood: drifting light blobs, particles, film grain. */
export const Procedural: React.FC<{mood: Mood; seed: string}> = ({mood, seed}) => {
  const frame = useCurrentFrame();
  const look = LOOKS[mood];
  const t = (frame / 30) * look.speed;
  const blobs = [0, 1, 2].map((i) => ({
    x: 50 + 35 * Math.sin(t * 0.6 + i * 2.1 + random(`${seed}-bx${i}`) * 6),
    y: 50 + 30 * Math.cos(t * 0.5 + i * 1.7 + random(`${seed}-by${i}`) * 6),
    c: look.colors[(i + 1) % 3],
  }));
  return (
    <AbsoluteFill style={{background: `linear-gradient(170deg, ${look.colors[0]}, ${look.colors[1]})`, overflow: 'hidden'}}>
      {blobs.map((b, i) => (
        <AbsoluteFill key={i} style={{background: `radial-gradient(circle at ${b.x}% ${b.y}%, ${b.c}cc 0%, transparent 45%)`, mixBlendMode: 'screen', opacity: 0.7}} />
      ))}
      {look.grid && (
        <AbsoluteFill style={{
          backgroundImage: 'linear-gradient(#48cae433 2px, transparent 2px), linear-gradient(90deg, #48cae433 2px, transparent 2px)',
          backgroundSize: '90px 90px', backgroundPosition: `0 ${(frame * 2) % 90}px`,
          transform: 'perspective(900px) rotateX(55deg) scale(2.2)', transformOrigin: '50% 100%', opacity: 0.6}} />
      )}
      {Array.from({length: look.particles}, (_, i) => {
        const size = 3 + random(`${seed}-s${i}`) * 9;
        const x = random(`${seed}-x${i}`) * 1080 + 30 * Math.sin(t + i);
        const y = (random(`${seed}-y${i}`) * 2100 - frame * look.rise * (0.5 + random(`${seed}-v${i}`))) % 2100;
        const yy = y < -60 ? y + 2100 : y;
        return <div key={i} style={{position: 'absolute', left: x, top: yy, width: size, height: size, borderRadius: '50%',
          background: look.dot, opacity: 0.25 + random(`${seed}-o${i}`) * 0.5, boxShadow: `0 0 ${size * 2}px ${look.dot}`}} />;
      })}
      <Grain frame={frame} />
    </AbsoluteFill>
  );
};

export const Grain: React.FC<{frame: number; opacity?: number}> = ({frame, opacity = 0.09}) => (
  <AbsoluteFill style={{opacity, mixBlendMode: 'overlay', pointerEvents: 'none'}}>
    <svg width="100%" height="100%">
      <filter id={`g${frame % 4}`}>
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={frame % 4} />
      </filter>
      <rect width="100%" height="100%" filter={`url(#g${frame % 4})`} />
    </svg>
  </AbsoluteFill>
);
