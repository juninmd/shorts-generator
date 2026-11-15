import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {linearTiming, TransitionSeries} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {slide} from '@remotion/transitions/slide';
import {Background, type BackgroundSpec} from './Background';
import type {Mood} from './backgrounds/types';

export interface ChapterData {
  title: string;
  narration: string;
  durationSec: number;
  background?: BackgroundSpec;
  mood?: Mood;
}

export interface NarratedProps {
  bookTitle: string;
  chapters: ChapterData[];
}

const FPS = 30;
const T = 12; // transition length in frames
const GROUP = 4; // words per caption line
const FONT = 'Poppins, Arial, sans-serif';

export const narratedFrames = (chapters: ChapterData[]) =>
  chapters.reduce((sum, c) => sum + Math.round(c.durationSec * FPS), 0) - T * Math.max(chapters.length - 1, 0);

export const Narrated: React.FC<NarratedProps> = ({bookTitle, chapters}) => (
  <AbsoluteFill style={{background: '#000', fontFamily: FONT}}>
    <TransitionSeries>
      {chapters.flatMap((c, i) => [
        ...(i > 0 ? [<TransitionSeries.Transition key={`t${i}`} timing={linearTiming({durationInFrames: T})}
          presentation={i % 2 ? slide({direction: 'from-bottom'}) : fade()} />] : []),
        <TransitionSeries.Sequence key={`s${i}`} durationInFrames={Math.round(c.durationSec * FPS)}>
          <ChapterScene chapter={c} index={i} bookTitle={bookTitle} />
        </TransitionSeries.Sequence>,
      ])}
    </TransitionSeries>
  </AbsoluteFill>
);

const ChapterScene: React.FC<{chapter: ChapterData; index: number; bookTitle: string}> = ({chapter, index, bookTitle}) => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();
  const enter = spring({frame, fps, config: {damping: 200}});
  const words = chapter.narration.split(/\s+/);
  // Prototype timing: words spread evenly over the chapter (real TTS gives word timestamps).
  const perWord = durationInFrames / words.length;
  const active = Math.min(words.length - 1, Math.floor(frame / perWord));
  const groupStart = Math.floor(active / GROUP) * GROUP;
  const pop = spring({frame: frame - active * perWord, fps, config: {damping: 12, stiffness: 200}});
  const mood = chapter.mood ?? 'neutral';
  const spec = chapter.background ?? {source: 'procedural' as const, mood};

  return (
    <AbsoluteFill>
      <Background spec={spec} mood={mood} seed={`ch${index}`} />
      <div style={{position: 'absolute', top: 110, left: 70, right: 70, opacity: enter, transform: `translateY(${interpolate(enter, [0, 1], [-40, 0])}px)`}}>
        <div style={{color: '#ffd60a', fontSize: 38, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase'}}>{bookTitle}</div>
        <div style={{color: '#fff', fontSize: 88, fontWeight: 800, lineHeight: 1.05, marginTop: 14, textShadow: '0 6px 24px rgba(0,0,0,.6)'}}>{chapter.title}</div>
      </div>
      <div style={{position: 'absolute', bottom: 330, left: 50, right: 50, textAlign: 'center', fontSize: 84, fontWeight: 800, lineHeight: 1.15,
        color: '#fff', WebkitTextStroke: '3px #000', paintOrder: 'stroke fill', textShadow: '0 6px 18px rgba(0,0,0,.8)'}}>
        {words.slice(groupStart, groupStart + GROUP).map((w, j) => {
          const idx = groupStart + j;
          const isActive = idx === active;
          return (
            <span key={idx} style={{display: 'inline-block', marginRight: 18, color: idx <= active ? '#ffd60a' : '#fff',
              transform: `scale(${isActive ? interpolate(pop, [0, 1], [0.85, 1.08]) : 1})`}}>{w}</span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
