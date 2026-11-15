import {buildSceneQuery} from './scene-query';
import type {Mood, SceneInput, SceneQuery} from './types';

const MOODS: Mood[] = ['dark', 'energetic', 'calm', 'tech', 'history', 'neutral'];

/**
 * Asks the LiteLLM gateway (OpenAI-compatible, same env as the main app) for stock-footage
 * queries. Any failure falls back to the offline heuristic, so the finder never blocks a render.
 */
export async function llmSceneQuery(scene: SceneInput, env = process.env, fetchFn = fetch): Promise<SceneQuery> {
  const base = buildSceneQuery(scene);
  if (!env.LITELLM_BASE_URL || !env.LITELLM_KEY) return base;
  const prompt =
    'You pick stock footage for a vertical short. Reply with JSON only: ' +
    '{"queries": [3 short English search queries, most concrete first, things a camera can film], ' +
    `"mood": one of ${MOODS.join('|')}}.\nScene title: ${scene.title}\nNarration: ${scene.narration}`;
  try {
    const res = await fetchFn(`${env.LITELLM_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {'content-type': 'application/json', authorization: `Bearer ${env.LITELLM_KEY}`},
      body: JSON.stringify({model: env.AI_MODEL ?? 'cloud/gemma3', temperature: 0.2, messages: [{role: 'user', content: prompt}]}),
    });
    if (!res.ok) return base;
    const body = (await res.json()) as {choices?: {message?: {content?: string}}[]};
    const raw = body.choices?.[0]?.message?.content ?? '';
    const parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)) as {queries?: unknown; mood?: unknown};
    const queries = Array.isArray(parsed.queries) ? parsed.queries.filter((q): q is string => typeof q === 'string' && q.trim() !== '') : [];
    if (queries.length === 0) return base;
    const mood = MOODS.includes(parsed.mood as Mood) ? (parsed.mood as Mood) : base.mood;
    const extra = queries.flatMap((q) => q.toLowerCase().split(/\s+/));
    return {...base, queries: [...new Set([...queries, ...base.queries])].slice(0, 4), keywords: [...new Set([...extra, ...base.keywords])], mood};
  } catch {
    return base;
  }
}
