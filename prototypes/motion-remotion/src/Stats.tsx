import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';

export interface StatsProps {
  title: string;
  bars: {label: string; value: number}[];
}

export const statsFrames = 6 * 30;

export const Stats: React.FC<StatsProps> = ({title, bars}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const titleIn = spring({frame, fps, config: {damping: 200}});
  return (
    <AbsoluteFill style={{background: '#0b132b', fontFamily: 'Poppins, Arial, sans-serif', padding: '220px 70px'}}>
      <div style={{color: '#fff', fontSize: 80, fontWeight: 800, opacity: titleIn, lineHeight: 1.1}}>{title}</div>
      <div style={{marginTop: 120, display: 'flex', flexDirection: 'column', gap: 46}}>
        {bars.map((b, i) => {
          const p = spring({frame: frame - 15 - i * 8, fps, config: {damping: 200}});
          const width = interpolate(p, [0, 1], [0, b.value]);
          const shown = Math.round(interpolate(p, [0, 1], [0, b.value]));
          return (
            <div key={b.label}>
              <div style={{color: '#fff', fontSize: 48, fontWeight: 700, display: 'flex', justifyContent: 'space-between'}}>
                <span>{b.label}</span>
                <span>{shown}</span>
              </div>
              <div style={{marginTop: 12, height: 56, background: '#1c2541', borderRadius: 28, overflow: 'hidden'}}>
                <div style={{width: `${width}%`, height: '100%', background: i === bars.length - 1 ? '#ffd60a' : '#3a86ff'}} />
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
