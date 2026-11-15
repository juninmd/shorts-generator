// Renders both prototype compositions to MP4 + a PNG still (evidence).
import {bundle} from '@remotion/bundler';
import {renderMedia, renderStill, selectComposition} from '@remotion/renderer';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'out');
const browserExecutable = process.env.BROWSER_EXECUTABLE || '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';
const serveUrl = await bundle({entryPoint: path.join(root, 'src/index.ts')});

for (const id of ['NarratedShort', 'StatsReveal']) {
  const composition = await selectComposition({serveUrl, id, browserExecutable, chromiumOptions: {args: ['--no-sandbox']}});
  await renderStill({composition, serveUrl, output: path.join(out, `${id}-frame.png`), frame: 60, browserExecutable, chromiumOptions: {args: ['--no-sandbox']}});
  await renderMedia({
    composition, serveUrl, codec: 'h264', outputLocation: path.join(out, `${id}.mp4`),
    browserExecutable, chromiumOptions: {args: ['--no-sandbox']}, logLevel: 'error',
  });
  console.log('rendered', id, composition.durationInFrames, 'frames');
}
