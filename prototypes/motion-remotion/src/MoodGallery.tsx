import React from 'react';
import {AbsoluteFill} from 'remotion';
import type {Mood} from './backgrounds/types';
import {Procedural} from './Procedural';

const MOODS: Mood[] = ['dark', 'energetic', 'calm', 'tech', 'history', 'neutral'];

/** All procedural looks side by side (evidence / design review). */
export const MoodGallery: React.FC = () => (
  <AbsoluteFill style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(2, 1fr)', background: '#000', gap: 6}}>
    {MOODS.map((m) => (
      <div key={m} style={{position: 'relative', overflow: 'hidden'}}>
        <div style={{position: 'absolute', inset: 0, width: 1080, height: 1920, transform: 'translateX(-92px) scale(0.5)', transformOrigin: '0 0'}}>
          <Procedural mood={m} seed={m} />
        </div>
        <div style={{position: 'absolute', bottom: 24, left: 0, right: 0, textAlign: 'center', color: '#fff', fontFamily: 'Poppins, Arial',
          fontWeight: 800, fontSize: 40, textShadow: '0 3px 10px #000'}}>{m}</div>
      </div>
    ))}
  </AbsoluteFill>
);
