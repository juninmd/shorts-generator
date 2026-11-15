export type Mood = 'dark' | 'energetic' | 'calm' | 'tech' | 'history' | 'neutral';

export interface SceneInput {
  id: string;
  title: string;
  narration: string;
  durationSec: number;
  /** Optional hand-written English stock query; wins over the extracted one. */
  visualQuery?: string;
}

export interface SceneQuery {
  sceneId: string;
  queries: string[]; // best first, English
  keywords: string[]; // lowercase tokens used for relevance scoring
  mood: Mood;
  durationSec: number;
}

export interface Candidate {
  provider: string;
  id: string;
  kind: 'video' | 'photo';
  url: string;
  width: number;
  height: number;
  durationSec?: number;
  tags: string[];
  author?: string;
  pageUrl?: string;
  license: string;
}

export interface ScoredCandidate extends Candidate {
  score: number;
  reasons: string[];
}

export type BackgroundChoice =
  | (ScoredCandidate & {source: 'stock'; localPath?: string})
  | {source: 'procedural'; mood: Mood; reasons: string[]};
