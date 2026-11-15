import React from 'react';
import {AbsoluteFill, Img, interpolate, Loop, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Mood} from './backgrounds/types';
import {Grain, LOOKS, Procedural} from './Procedural';

export type BackgroundSpec =
  | {source: 'stock'; kind: 'video' | 'photo'; src: string; width: number; height: number; durationSec?: number}
  | {source: 'procedural'; mood: Mood};

/** Media that is not vertical is shown whole over a blurred, darkened copy of itself (blur-fill). */
const Media: React.FC<{spec: Extract<BackgroundSpec, {source: 'stock'}>; style: React.CSSProperties}> = ({spec, style}) => {
  const {fps} = useVideoConfig();
  const src = staticFile(spec.src);
  if (spec.kind === 'photo') return <Img src={src} style={style} />;
  const video = <OffthreadVideo src={src} muted style={style} />;
  return spec.durationSec ? <Loop durationInFrames={Math.max(1, Math.floor(spec.durationSec * fps))}>{video}</Loop> : video;
};

export const Background: React.FC<{spec: BackgroundSpec; mood: Mood; seed: string}> = ({spec, mood, seed}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const p = frame / durationInFrames;
  const tint = LOOKS[mood].colors[2];
  let layer: React.ReactNode;
  if (spec.source === 'procedural') {
    layer = <Procedural mood={spec.mood} seed={seed} />;
  } else {
    const wide = spec.width / Math.max(spec.height, 1) > 0.8;
    const kenBurns = `scale(${interpolate(p, [0, 1], [1.04, 1.16])}) translate(${interpolate(p, [0, 1], [-1.5, 1.5])}%, ${interpolate(p, [0, 1], [1, -1])}%)`;
    const cover: React.CSSProperties = {width: '100%', height: '100%', objectFit: 'cover'};
    layer = (
      <AbsoluteFill style={{overflow: 'hidden', background: '#000'}}>
        {wide && <Media spec={spec} style={{...cover, filter: 'blur(38px) brightness(0.55) saturate(1.2)', transform: 'scale(1.25)'}} />}
        <AbsoluteFill style={{transform: kenBurns}}>
          <Media spec={spec} style={wide ? {width: '100%', height: '100%', objectFit: 'contain'} : cover} />
        </AbsoluteFill>
        {/* Mood grade: one tint over every source so clips from different banks look like one video. */}
        <AbsoluteFill style={{background: tint, mixBlendMode: 'soft-light', opacity: 0.35}} />
        <Grain frame={frame} opacity={0.06} />
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill>
      {layer}
      {/* Legibility scrim behind the title (top) and captions (bottom). */}
      <AbsoluteFill style={{background: 'linear-gradient(180deg, rgba(0,0,0,.55) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 55%, rgba(0,0,0,.78) 100%)'}} />
    </AbsoluteFill>
  );
};
