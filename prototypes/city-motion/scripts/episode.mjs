// One command per city: IBGE data -> script draft (kept if it already exists) -> narration -> music, mix, render.
// usage: node scripts/episode.mjs <ibge-code> [--episode N]   ->   out/<code>.mp4
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const [code, ...rest] = process.argv.slice(2);
if (!/^\d{7}$/.test(code ?? '')) { console.error('usage: node scripts/episode.mjs <ibge-code> [--episode N]'); process.exit(2); }
const step = (cmd, args) => execFileSync(cmd, args, { cwd: ROOT, stdio: 'inherit' });
const node = (script, ...args) => step(process.execPath, [`scripts/${script}`, ...args]);

node('fetch-city.mjs', code);
if (!existsSync(resolve(ROOT, 'episodes', `${code}.json`))) node('draft-episode.mjs', code, ...rest);
node('narrate.mjs', code);
node('render.mjs', '--meta');
step('uv', ['run', 'scripts/music.py', '--meta', 'out/meta.json', '--out', 'out/music.wav', '--mode', 'major', '--arp-db', '-4']);
node('mix.mjs');
node('render.mjs', '--audio', 'out/audio.wav', '--out', `${code}.mp4`);
