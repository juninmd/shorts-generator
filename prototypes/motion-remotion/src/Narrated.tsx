import React from 'react';
import {AbsoluteFill, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';

export interface ChapterData {
  title: string;
  narration: string;
  durationSec: number;
}

export interface NarratedProps {
  bookTitle: string;
  chapters: ChapterData[];
}

const FPS = 30;
const COLORS = ['#1d3557', '#7b2cbf', '#e63946'];
const GROUP = 5; // words per caption line

export const narratedFrames = (chapters: ChapterData[]) =>
  Math.round(chapters.reduce((sum, c) => sum + c.durationSec, 0) * FPS);

export const Narrated: React.FC<NarratedProps> = ({bookTitle, chapters}) => {
  let from = 0;
  return (
    <AbsoluteFill style={{background: '#000', fontFamily: 'Poppins, Arial, sans-serif'}}>
      {chapters.map((c, i) => {
        const dur = Math.round(c.durationSec * FPS);
        const start = from;
        from += dur;
        return (
          <Sequence key={i} from={start} durationInFrames={dur}>
            <ChapterScene chapter={c} index={i} bookTitle={bookTitle} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

const ChapterScene: React.FC<{chapter: ChapterData; index: number; bookTitle: string}> = ({
  chapter,
  index,
  bookTitle,
}) => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();
  const zoom = interpolate(frame, [0, durationInFrames], [1, 1.12]);
  const enter = spring({frame, fps, config: {damping: 200}});
  const words = chapter.narration.split(/\s+/);
  // Prototype timing: words spread evenly over the chapter (real TTS gives word timestamps).
  const perWord = durationInFrames / words.length;
  const active = Math.min(words.length - 1, Math.floor(frame / perWord));
  const groupStart = Math.floor(active / GROUP) * GROUP;
  const group = words.slice(groupStart, groupStart + GROUP);

  return (
    <AbsoluteFill style={{background: `linear-gradient(160deg, ${COLORS[index % COLORS.length]}, #000)`}}>
      <AbsoluteFill style={{transform: `scale(${zoom})`, justifyContent: 'center', alignItems: 'center'}}>
        <div
          style={{
            opacity: enter,
            transform: `translateY(${interpolate(enter, [0, 1], [80, 0])}px)`,
            color: '#fff',
            fontSize: 110,
            fontWeight: 800,
            textAlign: 'center',
            padding: '0 60px',
            lineHeight: 1.05,
          }}
        >
          {chapter.title}
        </div>
      </AbsoluteFill>
      <div style={{position: 'absolute', top: 90, left: 60, color: '#ffd60a', fontSize: 42, fontWeight: 700}}>
        {bookTitle}
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: 260,
          left: 60,
          right: 60,
          textAlign: 'center',
          fontSize: 76,
          fontWeight: 800,
          color: '#fff',
          textShadow: '0 4px 14px #000',
        }}
      >
        {group.map((w, j) => (
          <span key={j} style={{color: groupStart + j <= active ? '#ffd60a' : '#fff', marginRight: 16}}>
            {w}
          </span>
        ))}
      </div>
    </AbsoluteFill>
  );
};
