import type {Candidate, SceneQuery, ScoredCandidate} from './types';

const TARGET_RATIO = 9 / 16;

/**
 * Explainable score (higher is better). Each term adds a reason so the audit file shows
 * why a background won: relevance, vertical fit, resolution, motion, length and freshness.
 */
export function scoreCandidate(c: Candidate, scene: SceneQuery, used: Set<string>): ScoredCandidate {
  const reasons: string[] = [];
  let score = 0;
  const tags = new Set(c.tags.map((t) => t.toLowerCase()));
  const hits = scene.keywords.filter((k) => tags.has(k) || [...tags].some((t) => t.includes(k) && k.length > 3));
  const relevance = scene.keywords.length ? hits.length / Math.min(scene.keywords.length, 4) : 0;
  score += Math.min(relevance, 1) * 40;
  reasons.push(`relevância ${hits.length} (${hits.slice(0, 3).join(', ') || 'nenhuma'})`);

  const ratio = c.width && c.height ? c.width / c.height : 1;
  const fit = 1 - Math.min(Math.abs(ratio - TARGET_RATIO) / TARGET_RATIO, 1);
  score += fit * 20;
  reasons.push(ratio <= 0.8 ? 'vertical' : ratio < 1.2 ? 'quadrado (blur-fill)' : 'horizontal (blur-fill)');

  const shortSide = Math.min(c.width, c.height);
  const [resPoints, resLabel] = shortSide >= 1080 ? [15, '≥1080p'] : shortSide >= 720 ? [8, '720p'] : [-20, 'baixa resolução'];
  score += resPoints;
  reasons.push(resLabel);

  if (c.kind === 'video') {
    score += 10;
    reasons.push('movimento real');
    if (c.durationSec !== undefined && c.durationSec < scene.durationSec) {
      score -= 8;
      reasons.push('mais curto que a cena (loop)');
    }
  }
  if (c.provider === 'local') {
    score += 5;
    reasons.push('biblioteca própria');
  }
  if (used.has(c.id) || (c.author && used.has(`author:${c.author}`))) {
    score -= 30;
    reasons.push('já usado neste vídeo');
  }
  return {...c, score: Math.round(score * 10) / 10, reasons};
}

/** Best candidates first; candidates with no relevance at all are dropped. */
export function rankCandidates(candidates: Candidate[], scene: SceneQuery, used = new Set<string>()): ScoredCandidate[] {
  const seen = new Set<string>();
  return candidates
    .filter((c) => !seen.has(c.id) && seen.add(c.id))
    .map((c) => scoreCandidate(c, scene, used))
    .filter((c) => !c.reasons[0].endsWith('(nenhuma)'))
    .sort((a, b) => b.score - a.score);
}
