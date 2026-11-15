import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {findBackgrounds} from '../src/backgrounds/find-backgrounds';
import {llmSceneQuery} from '../src/backgrounds/llm-query';
import {pexelsPhotos, pexelsVideos, pixabay, providersFromEnv, unsplash, localLibrary} from '../src/backgrounds/providers';
import {rankCandidates} from '../src/backgrounds/rank';
import {buildSceneQuery, detectMood} from '../src/backgrounds/scene-query';
import type {Candidate} from '../src/backgrounds/types';

const fixture = (name: string) => JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures', name), 'utf8'));
const jsonFetch = (routes: Record<string, unknown>) => (async (input: string | URL) => {
  const url = String(input);
  const hit = Object.entries(routes).find(([k]) => url.includes(k));
  if (!hit) return new Response('nope', {status: 404});
  return hit[1] instanceof Uint8Array ? new Response(hit[1]) : Response.json(hit[1]);
}) as typeof fetch;

const scene = {id: 'ch1', title: '1815: nasce em Londres', narration: 'Ada Byron nasceu em Londres, filha do poeta Lord Byron.', durationSec: 4};

test('scene query translates Portuguese visual words and detects mood', () => {
  const q = buildSceneQuery(scene);
  assert.ok(q.keywords.includes('london'));
  assert.equal(q.mood, 'history');
  assert.equal(detectMood('o algoritmo roda no computador'), 'tech');
  assert.equal(detectMood('nada aqui'), 'neutral');
  assert.equal(buildSceneQuery({...scene, visualQuery: 'victorian london street'}).queries[0], 'victorian london street');
});

test('LLM queries are merged, and any failure falls back to the heuristic', async () => {
  const env = {LITELLM_BASE_URL: 'http://llm/v1', LITELLM_KEY: 'k'};
  const ok = jsonFetch({'/chat/completions': {choices: [{message: {content: 'ok {"queries":["foggy victorian london"],"mood":"dark"}'}}]}});
  const q = await llmSceneQuery(scene, env, ok);
  assert.equal(q.queries[0], 'foggy victorian london');
  assert.equal(q.mood, 'dark');
  assert.ok(q.keywords.includes('foggy'));
  const broken = jsonFetch({'/chat/completions': {choices: [{message: {content: 'no json'}}]}});
  assert.deepEqual(await llmSceneQuery(scene, env, broken), buildSceneQuery(scene));
  assert.deepEqual(await llmSceneQuery(scene, {}, ok), buildSceneQuery(scene));
});

test('providers normalise Pexels, Pixabay and Unsplash responses', async () => {
  const f = jsonFetch({'videos/search': fixture('pexels-videos.json'), 'v1/search': fixture('pexels-photos.json'),
    'pixabay.com/api/videos': fixture('pixabay-videos.json'), 'pixabay.com/api/?': fixture('pixabay-photos.json'), unsplash: fixture('unsplash.json')});
  const [v] = await pexelsVideos('k', f).search('london');
  assert.equal(v.kind, 'video');
  assert.equal(v.width, 1080);
  assert.ok(v.tags.includes('london'));
  assert.equal((await pexelsPhotos('k', f).search('x'))[0].kind, 'photo');
  assert.deepEqual((await pixabay('k', 'video', f).search('x'))[0].tags, ['london', 'bridge', 'river']);
  assert.equal((await pixabay('k', 'photo', f).search('x'))[0].height, 3000);
  assert.ok((await unsplash('k', f).search('x'))[0].tags.includes('london'));
  assert.equal(providersFromEnv({PEXELS_API_KEY: 'a', PIXABAY_API_KEY: 'b', UNSPLASH_ACCESS_KEY: 'c', BACKGROUND_DIR: '/x'}).length, 6);
  assert.equal(providersFromEnv({}).length, 0);
});

test('ranking prefers relevant vertical high-res motion and avoids repeats', () => {
  const base = {tags: ['london', 'street'], license: 'x', url: 'u'};
  const cands: Candidate[] = [
    {...base, provider: 'p', id: 'wide', kind: 'photo', width: 1920, height: 1080},
    {...base, provider: 'p', id: 'tall-video', kind: 'video', width: 1080, height: 1920, durationSec: 10},
    {...base, provider: 'p', id: 'tiny', kind: 'video', width: 360, height: 640, durationSec: 10},
    {...base, provider: 'p', id: 'off-topic', kind: 'video', width: 1080, height: 1920, tags: ['cat']},
  ];
  const q = buildSceneQuery(scene);
  const ranked = rankCandidates(cands, q);
  assert.deepEqual(ranked.map((c) => c.id), ['tall-video', 'wide', 'tiny']);
  assert.ok(ranked[0].reasons.includes('vertical'));
  assert.equal(rankCandidates(cands, q, new Set(['tall-video']))[0].id, 'wide');
  const short = rankCandidates([{...cands[1], durationSec: 1}], q)[0];
  assert.ok(short.reasons.includes('mais curto que a cena (loop)'));
});

test('finder downloads the winner, never repeats it, and falls back to a procedural mood backdrop', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bg-'));
  const f = jsonFetch({'videos/search': fixture('pexels-videos.json'), 'cdn.example/': new Uint8Array([1, 2, 3])});
  const scenes = [scene, {...scene, id: 'ch2'}, {id: 'ch3', title: 'zzz', narration: 'qqq www', durationSec: 3}];
  const logs: string[] = [];
  const out = await findBackgrounds(scenes, {providers: [pexelsVideos('k', f)], downloadDir: dir, fetchFn: f, queryFn: async (s) => buildSceneQuery(s), log: (m) => logs.push(m)});
  assert.equal(out[0].choice.source, 'stock');
  assert.ok(out[0].choice.source === 'stock' && fs.existsSync(out[0].choice.localPath!));
  assert.ok(out[1].choice.source === 'stock' && out[1].choice.id !== (out[0].choice.source === 'stock' && out[0].choice.id));
  assert.deepEqual(out[2].choice, {source: 'procedural', mood: 'neutral', reasons: ['nenhum candidato relevante', 'clima: neutral']});
  const none = await findBackgrounds([scene], {providers: [], queryFn: async (s) => buildSceneQuery(s)});
  assert.equal(none[0].choice.source, 'procedural');
});

test('local library uses file names as tags', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lib-'));
  fs.writeFileSync(path.join(dir, 'london-street-night.jpg'), '');
  const [c] = await localLibrary(dir, () => ({width: 1080, height: 1920})).search('london');
  assert.deepEqual(c.tags, ['london', 'street', 'night']);
  assert.equal(c.kind, 'photo');
  assert.deepEqual(await localLibrary('/nope').search('x'), []);
});
