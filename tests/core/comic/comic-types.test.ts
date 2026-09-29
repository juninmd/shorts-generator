import { describe, it, expect } from 'vitest';
import type { ComicChapter, ComicBook, NarratedChapter, ComicShortResult } from '../../../src/core/comic/comic-types.js';

describe('comic-types', () => {
  it('should allow assignment to types', () => {
    const chapter: ComicChapter = {
      id: '1',
      title: 'Test',
      imagePath: 'path.jpg',
      narrationText: 'text'
    };
    expect(chapter.id).toBe('1');

    const book: ComicBook = {
        id: '1',
        title: 'T',
        chapters: []
    };
    expect(book.id).toBe('1');

    const narrated: NarratedChapter = {
        id: '1',
        title: 'T',
        imagePath: 'I',
        narrationText: 'N',
        audioPath: 'A',
        durationSec: 1,
        words: []
    };
    expect(narrated.durationSec).toBe(1);

    const res: ComicShortResult = {
        id: '1',
        bookTitle: 'T',
        outputPath: 'O',
        subtitlePath: 'S',
        durationSec: 1,
        chapters: 1
    };
    expect(res.chapters).toBe(1);
  });
});
