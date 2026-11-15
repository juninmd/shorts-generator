import React from 'react';
import {Composition, continueRender, delayRender, staticFile} from 'remotion';
import sample from './data/sample-book.json';
import backgrounds from './data/backgrounds.json';
import type {BackgroundSpec} from './Background';
import type {Mood} from './backgrounds/types';
import {MoodGallery} from './MoodGallery';
import {Narrated, narratedFrames, type NarratedProps} from './Narrated';
import {Stats, statsFrames, type StatsProps} from './Stats';

// Bundled Poppins ExtraBold (same font as the FFmpeg captions), loaded before the first frame.
if (typeof document !== 'undefined') {
  const handle = delayRender('Poppins');
  new FontFace('Poppins', `url(${staticFile('fonts/Poppins-ExtraBold.ttf')})`, {weight: '800'})
    .load()
    .then((font) => document.fonts.add(font))
    .finally(() => continueRender(handle));
}

interface ManifestEntry { query: {mood: string}; choice: {source: string; kind?: string; src?: string; width?: number; height?: number; durationSec?: number; mood?: string} }

/** backgrounds.json (written by scripts/find-backgrounds.ts) → per-chapter render spec. */
function toSpec(entry: ManifestEntry | undefined): {background?: BackgroundSpec; mood?: Mood} {
  if (!entry) return {};
  const mood = entry.query.mood as Mood;
  const c = entry.choice;
  if (c.source === 'stock' && c.src) {
    return {mood, background: {source: 'stock', kind: c.kind === 'video' ? 'video' : 'photo', src: c.src, width: c.width ?? 0, height: c.height ?? 0, durationSec: c.durationSec}};
  }
  return {mood, background: {source: 'procedural', mood}};
}

const narratedProps: NarratedProps = {
  bookTitle: sample.bookTitle,
  chapters: sample.chapters.map((c, i) => ({...c, ...toSpec((backgrounds as ManifestEntry[])[i])})),
};
const statsProps: StatsProps = sample.stats;

export const Root: React.FC = () => (
  <>
    <Composition id="NarratedShort" component={Narrated} durationInFrames={narratedFrames(narratedProps.chapters)}
      fps={30} width={1080} height={1920} defaultProps={narratedProps} />
    <Composition id="StatsReveal" component={Stats} durationInFrames={statsFrames} fps={30} width={1080} height={1920} defaultProps={statsProps} />
    <Composition id="MoodGallery" component={MoodGallery} durationInFrames={90} fps={30} width={1080} height={1920} />
  </>
);
