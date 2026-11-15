import fs from 'node:fs';
import path from 'node:path';
import {llmSceneQuery} from './llm-query';
import {providersFromEnv, type Fetch, type Provider} from './providers';
import {rankCandidates} from './rank';
import type {BackgroundChoice, Candidate, SceneInput, SceneQuery} from './types';

export interface SceneBackground {
  sceneId: string;
  query: SceneQuery;
  choice: BackgroundChoice;
  /** Runner-ups kept in the audit so a human can swap one in. */
  alternatives: {id: string; provider: string; score: number; pageUrl?: string}[];
}

interface Options {
  providers?: Provider[];
  downloadDir?: string;
  fetchFn?: Fetch;
  queryFn?: (scene: SceneInput) => Promise<SceneQuery>;
  log?: (msg: string) => void;
}

async function searchAll(providers: Provider[], queries: string[], log: (m: string) => void): Promise<Candidate[]> {
  const out: Candidate[] = [];
  for (const query of queries) {
    const results = await Promise.allSettled(providers.map((p) => p.search(query)));
    results.forEach((r, i) => (r.status === 'fulfilled' ? out.push(...r.value) : log(`${providers[i].name}: ${r.reason}`)));
    if (out.length >= 10) break; // the most concrete query already gave enough to choose from
  }
  return out;
}

async function download(url: string, dir: string, id: string, fetchFn: Fetch): Promise<string> {
  const remote = /^https?:/.test(url);
  const ext = path.extname(remote ? new URL(url).pathname : url) || '.bin';
  const file = path.join(dir, `${id.replace(/[^\w-]/g, '_')}${ext}`);
  if (fs.existsSync(file)) return file;
  fs.mkdirSync(dir, {recursive: true});
  if (!remote) {
    fs.copyFileSync(url, file); // library file: copied next to the downloads so the renderer can serve it
    return file;
  }
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

/** One background per scene: best stock/library media, else a procedural backdrop matched to the mood. */
export async function findBackgrounds(scenes: SceneInput[], opts: Options = {}): Promise<SceneBackground[]> {
  const fetchFn = opts.fetchFn ?? fetch;
  const providers = opts.providers ?? providersFromEnv(process.env, fetchFn);
  const queryFn = opts.queryFn ?? ((s: SceneInput) => llmSceneQuery(s, process.env, fetchFn));
  const log = opts.log ?? (() => undefined);
  const used = new Set<string>();
  const result: SceneBackground[] = [];

  for (const scene of scenes) {
    const query = await queryFn(scene);
    const ranked = providers.length ? rankCandidates(await searchAll(providers, query.queries, log), query, used) : [];
    let choice: BackgroundChoice = {source: 'procedural', mood: query.mood,
      reasons: [providers.length ? 'nenhum candidato relevante' : 'nenhum provedor configurado', `clima: ${query.mood}`]};
    for (const best of ranked.slice(0, 3)) {
      try {
        const localPath = opts.downloadDir ? await download(best.url, opts.downloadDir, best.id, fetchFn) : undefined;
        choice = {...best, source: 'stock', localPath};
        used.add(best.id);
        if (best.author) used.add(`author:${best.author}`);
        break;
      } catch (err) {
        log(`${best.id}: ${String(err)}`);
      }
    }
    const alternatives = ranked.filter((c) => choice.source !== 'stock' || c.id !== choice.id).slice(0, 3)
      .map(({id, provider, score, pageUrl}) => ({id, provider, score, pageUrl}));
    result.push({sceneId: scene.id, query, choice, alternatives});
  }
  return result;
}
