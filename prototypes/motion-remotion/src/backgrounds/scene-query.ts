import type {Mood, SceneInput, SceneQuery} from './types';

// Words that never describe a picture (pt-BR + en).
const STOP = new Set(
  ('a o as os um uma uns umas de do da dos das em no na nos nas por para pra com sem sobre entre e ou mas que se ' +
    'é foi era ser são está estava ele ela eles elas seu sua seus suas lhe isso isto aquilo desde cedo quando onde ' +
    'como mais muito muita também já ainda the of and or in on at to for with from by is was are be it its this that ' +
    'he she they his her their as an')
    .split(' '),
);

// Small pt→en visual dictionary so Portuguese narration still finds English stock tags.
const PT_EN: Record<string, string> = {
  londres: 'london', cidade: 'city', mar: 'sea', praia: 'beach', floresta: 'forest', montanha: 'mountain',
  noite: 'night', chuva: 'rain', fogo: 'fire', guerra: 'war', dinheiro: 'money', computador: 'computer',
  máquina: 'machine', máquinas: 'machines', números: 'numbers', matemática: 'mathematics', poeta: 'poet',
  livro: 'book', livros: 'books', escola: 'school', céu: 'sky', estrelas: 'stars', espaço: 'space',
  carro: 'car', corrida: 'race', futebol: 'soccer', música: 'music', algoritmo: 'code', programa: 'code',
  ciência: 'science', história: 'history', rua: 'street', casa: 'house', família: 'family', criança: 'child',
};

const MOOD_WORDS: Record<Exclude<Mood, 'neutral'>, string[]> = {
  dark: ['morte', 'guerra', 'crime', 'medo', 'sombra', 'noite', 'death', 'war', 'crime', 'fear', 'dark', 'night'],
  energetic: ['corrida', 'explosão', 'vitória', 'gol', 'rápido', 'race', 'explosion', 'win', 'fast', 'action'],
  calm: ['paz', 'mar', 'praia', 'calma', 'natureza', 'peace', 'sea', 'beach', 'calm', 'nature'],
  tech: ['computador', 'algoritmo', 'programa', 'código', 'máquina', 'máquinas', 'computer', 'code', 'machine', 'ai'],
  history: ['nasceu', 'século', 'império', 'rei', 'rainha', 'poeta', 'born', 'century', 'empire', 'king', 'queen'],
};

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFC')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w));
}

export function detectMood(text: string): Mood {
  const words = new Set(tokenize(text));
  let best: Mood = 'neutral';
  let bestHits = 0;
  for (const [mood, list] of Object.entries(MOOD_WORDS) as [Mood, string[]][]) {
    const hits = list.filter((w) => words.has(w)).length;
    if (hits > bestHits) [best, bestHits] = [mood, hits];
  }
  return best;
}

/** Heuristic query builder: used directly offline, and as the fallback when the LLM step fails. */
export function buildSceneQuery(scene: SceneInput): SceneQuery {
  const titleWords = tokenize(scene.title);
  const bodyWords = tokenize(scene.narration);
  const ranked = [...new Set([...titleWords, ...bodyWords])].map((w) => PT_EN[w] ?? w);
  const keywords = [...new Set(ranked)].slice(0, 6);
  const queries = [
    ...(scene.visualQuery ? [scene.visualQuery] : []),
    keywords.slice(0, 3).join(' '),
    keywords.slice(0, 1).join(' '),
  ].filter((q, i, all) => q && all.indexOf(q) === i);
  const mood = detectMood(`${scene.title} ${scene.narration}`);
  return {sceneId: scene.id, queries, keywords: [...new Set([...keywords, ...tokenize(scene.visualQuery ?? '')])], mood, durationSec: scene.durationSec};
}
