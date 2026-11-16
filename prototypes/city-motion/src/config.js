import episode from './data/episode.js';

// Per-video settings. The canvas is 1080x1920 (vertical); other ratios also need style.css and the scene layouts.
export default {
  fps: 30,
  hud: {
    topLeft: episode.series,
    topRight: `${episode.city.state.code} · EP ${String(episode.episode).padStart(2, '0')}`,
  },
};
