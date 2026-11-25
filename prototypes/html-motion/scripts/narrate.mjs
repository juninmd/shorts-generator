// Narrates every scene with the repo's Kokoro helper, then writes out/plan.json and out/voice.wav.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAP, LEAD_IN, captionPages, planTimeline } from './plan.mjs';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const OUT = join(ROOT, 'out');
const TTS = resolve(ROOT, '..', '..', 'scripts', 'kokoro_tts.py');
const python = process.env.PYTHON_BIN || 'python3';
const voice = process.env.KOKORO_VOICE || 'pm_alex';
if (!process.env.KOKORO_MODEL_DIR) throw new Error('set KOKORO_MODEL_DIR (see README)');

const story = JSON.parse(readFileSync(join(ROOT, 'story.json'), 'utf8'));
mkdirSync(OUT, { recursive: true });
const probe = f => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());

const narrations = story.scenes.map(scene => {
  const base = join(OUT, scene.id);
  writeFileSync(`${base}.txt`, scene.text);
  execFileSync(python, [TTS, `${base}.txt`, `${base}.wav`, `${base}.words.json`, voice], { stdio: 'inherit', timeout: 300_000 });
  return { file: `${base}.wav`, duration: probe(`${base}.wav`), words: JSON.parse(readFileSync(`${base}.words.json`, 'utf8')) };
});

const plan = { ...planTimeline(story.scenes, narrations), captions: [] };
plan.captions = captionPages(plan.scenes);
writeFileSync(join(OUT, 'plan.json'), JSON.stringify(plan));

// One voice track on the plan's clock: each clip delayed to its voiceStart, then mixed.
const inputs = narrations.flatMap(n => ['-i', n.file]);
const delays = plan.scenes.map((s, i) => `[${i}:a]adelay=${Math.round(s.voiceStart * 1000)}:all=1[a${i}]`);
const mix = `${plan.scenes.map((_, i) => `[a${i}]`).join('')}amix=inputs=${plan.scenes.length}:normalize=0,apad=whole_dur=${plan.duration}[v]`;
execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', [...delays, mix].join(';'), '-map', '[v]', '-ar', '48000', join(OUT, 'voice.wav')]);
console.error(`plan: ${plan.scenes.length} scenes, ${plan.duration.toFixed(2)}s (lead-in ${LEAD_IN}s, gap ${GAP}s)`);
