import episode from '../data/episode.js';
import mapIntro from './map-intro.js';
import timeline from './timeline.js';
import counter from './counter.js';
import rankBars from './rank-bars.js';
import density from './density.js';
import outro from './outro.js';

// Scene types an episode script (episodes/<code>.json) may use.
const builders = { 'map-intro': mapIntro, timeline, counter, 'rank-bars': rankBars, density, outro };
const TRANSITIONS = ['rise', 'wipe'];

// Order = playback order. Durations come from the narration (scripts/narrate.mjs), in multiples of one beat.
export default episode.scenes.map((scene, i) => {
  const make = builders[scene.type];
  if (!make) throw new Error(`unknown scene type "${scene.type}" (known: ${Object.keys(builders).join(', ')})`);
  return {
    id: `${i + 1}-${scene.type}`,
    dur: scene.dur,
    transition: i === 0 ? 'cut' : TRANSITIONS[i % 2],
    build: root => make(root, scene, episode),
  };
});
