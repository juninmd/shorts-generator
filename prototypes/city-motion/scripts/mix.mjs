// Lay each scene's narration on the timeline, duck the music under the voice and normalise to -14 LUFS.
// usage: node scripts/mix.mjs   (needs out/meta.json, out/narration.json, out/music.wav)   ->   out/audio.wav
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const OUT = resolve(fileURLToPath(import.meta.url), '..', '..', 'out');
const MUSIC_DB = Number(process.env.MUSIC_DB ?? -13); // music level under the voice, before ducking
const meta = JSON.parse(await readFile(join(OUT, 'meta.json'), 'utf8'));
const narration = JSON.parse(await readFile(join(OUT, 'narration.json'), 'utf8'));
const starts = [0, ...meta.cuts];
if (starts.length !== narration.length) throw new Error(`meta has ${starts.length} scenes, narration has ${narration.length}: run narrate again`);

const inputs = narration.flatMap(n => ['-i', n.file]);
const voices = narration.map((n, i) => {
  const ms = Math.round((starts[i] + n.lead) * 1000);
  return `[${i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${ms}:all=1[v${i}]`;
});
const m = narration.length; // index of the music input
const graph = [
  ...voices,
  `${narration.map((_, i) => `[v${i}]`).join('')}amix=inputs=${m}:normalize=0,apad=whole_dur=${meta.duration},asplit[voice][key]`,
  `[${m}:a]aresample=48000,volume=${MUSIC_DB}dB[music]`,
  '[music][key]sidechaincompress=threshold=0.03:ratio=6:attack=15:release=350[ducked]',
  '[voice][ducked]amix=inputs=2:normalize=0[mix]',
].join(';');
const base = ['-hide_banner', '-nostats', '-y', ...inputs, '-i', join(OUT, 'music.wav'), '-filter_complex'];
const LOUD = 'loudnorm=I=-14:TP=-1.5:LRA=11';

// pass 1 measures, pass 2 applies the measured values (linear gain where possible)
const first = await run('ffmpeg', [...base, `${graph};[mix]${LOUD}:print_format=json[o]`, '-map', '[o]', '-t', String(meta.duration), '-f', 'null', '-']);
const stats = JSON.parse(first.stderr.slice(first.stderr.lastIndexOf('{'), first.stderr.lastIndexOf('}') + 1));
const measured = `measured_I=${stats.input_i}:measured_TP=${stats.input_tp}:measured_LRA=${stats.input_lra}:measured_thresh=${stats.input_thresh}:offset=${stats.target_offset}`;
await run('ffmpeg', [...base, `${graph};[mix]${LOUD}:${measured}:linear=true[o]`, '-map', '[o]', '-t', String(meta.duration), '-ar', '48000', join(OUT, 'audio.wav')]);
console.error(`audio: out/audio.wav (${meta.duration}s, input ${stats.input_i} LUFS -> -14)`);
