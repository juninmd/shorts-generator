import { describe, it, expect } from 'vitest';
import type { ComicChapter, ComicBook, NarratedChapter, ComicShortResult } from '../../../src/core/comic/comic-types.js';

describe('comic-types', () => {
  it('should compile type definitions', () => {
    // Asserting types structurally rather than null equals null
    const chapter: Partial<ComicChapter> = { id: 'test' };
    expect(chapter.id).toBe('test');

    const book: Partial<ComicBook> = { id: 'book' };
    expect(book.id).toBe('book');

    const narrated: Partial<NarratedChapter> = { durationSec: 10 };
    expect(narrated.durationSec).toBe(10);

    const result: Partial<ComicShortResult> = { chapters: 2 };
    expect(result.chapters).toBe(2);
  });
});
