import React from 'react';
import {Composition} from 'remotion';
import sample from './data/sample-book.json';
import {Narrated, narratedFrames, NarratedProps} from './Narrated';
import {Stats, statsFrames, StatsProps} from './Stats';

const narratedProps: NarratedProps = {bookTitle: sample.bookTitle, chapters: sample.chapters};
const statsProps: StatsProps = sample.stats;

export const Root: React.FC = () => (
  <>
    <Composition
      id="NarratedShort"
      component={Narrated}
      durationInFrames={narratedFrames(narratedProps.chapters)}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={narratedProps}
    />
    <Composition
      id="StatsReveal"
      component={Stats}
      durationInFrames={statsFrames}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={statsProps}
    />
  </>
);
