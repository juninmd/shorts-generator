import { describe, expect, it } from 'vitest';
import { wrapText } from '../../../src/core/quiz/quiz-assets.service.js';

describe('wrapText edge cases', () => {
  it('covers the lines length condition branch', () => {
    expect(wrapText('abc de', 1)).toBe('abc\nde');
  });
});
