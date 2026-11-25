import test from 'node:test';
import assert from 'node:assert/strict';
import { GAP, LEAD_IN, TAIL, captionPages, planTimeline } from '../scripts/plan.mjs';

const w = (word, start, end) => ({ word, start, end });
const narr = [
  { duration: 2, words: [w('Oi', 0, 0.4), w('dev.', 0.5, 1.9)] },
  { duration: 3, words: [w('Um', 0, 0.5), w('dois', 0.6, 1), w('três', 1.1, 1.5), w('quatro', 1.6, 2.9)] },
];

test('scenes tile the timeline with no hole and no overlap', () => {
  const plan = planTimeline([{ id: 'a' }, { id: 'b' }], narr);
  const [a, b] = plan.scenes;
  assert.equal(a.start, 0);
  assert.equal(a.end, b.start);
  assert.ok(b.end <= plan.duration);
});

test('words are shifted onto the global clock and the voice never starts at frame 0', () => {
  const { scenes } = planTimeline([{ id: 'a' }, { id: 'b' }], narr);
  assert.equal(scenes[0].words[0].start, LEAD_IN);
  assert.equal(scenes[1].voiceStart, LEAD_IN + 2 + GAP);
  assert.equal(scenes[1].words[3].end, scenes[1].voiceStart + 2.9);
});

test('final hold stays under the 1.4 s ceiling', () => {
  const plan = planTimeline([{ id: 'a' }, { id: 'b' }], narr);
  const lastVoiceEnd = plan.scenes[1].voiceStart + 3;
  assert.ok(plan.duration - lastVoiceEnd <= 1.4);
  assert.ok(TAIL <= 1.4);
});

test('a mismatch between scenes and narrations fails loudly', () => {
  assert.throws(() => planTimeline([{ id: 'a' }], narr), /every scene/);
});

test('caption pages break at punctuation and at three words, never across scenes', () => {
  const { scenes } = planTimeline([{ id: 'a' }, { id: 'b' }], narr);
  const pages = captionPages(scenes).map(p => p.words.map(x => x.word).join(' '));
  assert.deepEqual(pages, ['Oi dev.', 'Um dois três', 'quatro']);
});
