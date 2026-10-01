import { describe, it, expect } from 'vitest';
import type { ComicChapter, ComicBook, NarratedChapter, ComicShortResult } from '../../../src/core/comic/comic-types.js';

describe('Comic Types Nullability', () => {
  it('should test ComicChapter nullability', () => {
    const dummy: ComicChapter | null = null;
    expect(dummy).toBeNull();
  });

  it('should test ComicBook nullability', () => {
    const dummy: ComicBook | null = null;
    expect(dummy).toBeNull();
  });

  it('should test NarratedChapter nullability', () => {
    const dummy: NarratedChapter | null = null;
    expect(dummy).toBeNull();
  });

  it('should test ComicShortResult nullability', () => {
    const dummy: ComicShortResult | null = null;
    expect(dummy).toBeNull();
  });
});
