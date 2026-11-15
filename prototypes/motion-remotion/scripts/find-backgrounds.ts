// Picks a background for every chapter of a book and writes src/data/backgrounds.json.
// Usage: npx tsx scripts/find-backgrounds.ts [book.json]
// Keys (any subset): PEXELS_API_KEY, PIXABAY_API_KEY, UNSPLASH_ACCESS_KEY, BACKGROUND_DIR; LITELLM_* for LLM queries.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {findBackgrounds} from '../src/backgrounds/find-backgrounds';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bookPath = process.argv[2] ?? path.join(root, 'src/data/sample-book.json');
const book = JSON.parse(fs.readFileSync(bookPath, 'utf8')) as {chapters: {title: string; narration: string; durationSec: number; visualQuery?: string}[]};
const publicDir = path.join(root, 'public');

const scenes = book.chapters.map((c, i) => ({id: `ch${i + 1}`, ...c}));
const found = await findBackgrounds(scenes, {downloadDir: path.join(publicDir, 'bg'), log: (m) => console.warn('[bg]', m)});
const manifest = found.map((f) => ({
  ...f,
  choice: f.choice.source === 'stock' && f.choice.localPath
    ? {...f.choice, src: path.relative(publicDir, path.resolve(f.choice.localPath)).split(path.sep).join('/')}
    : f.choice,
}));
fs.writeFileSync(path.join(root, 'src/data/backgrounds.json'), JSON.stringify(manifest, null, 2));
for (const f of manifest) {
  const c = f.choice;
  console.log(`${f.sceneId} [${f.query.mood}] "${f.query.queries[0]}" → ${c.source === 'stock' ? `${c.provider} ${c.id} (${c.score})` : `procedural ${c.mood}`}`);
  console.log(`   ${c.reasons.join(' · ')}`);
}
