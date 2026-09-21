import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runComicPipeline } from '../../../src/core/comic/comic-pipeline.js';
import * as comicTts from '../../../src/core/comic/comic-tts.js';
import * as comicVideo from '../../../src/core/comic/comic-video.js';
import * as subtitle from '../../../src/core/subtitle.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

vi.mock('../../../src/core/comic/comic-tts.js');
vi.mock('../../../src/core/comic/comic-video.js');
vi.mock('../../../src/core/subtitle.js');
vi.mock('node:fs');

describe('comic-pipeline', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should run comic pipeline successfully', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined);
    vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined);

    vi.spyOn(comicTts, 'narrateChapters').mockResolvedValue([
      { id: 'ch1', title: 'c1', imagePath: 'i', narrationText: 't', audioPath: 'a', durationSec: 5, words: [{ word: 'w', start: 0, end: 1 }] },
      { id: 'ch2', title: 'c2', imagePath: 'i', narrationText: 't', audioPath: 'a', durationSec: 5, words: [{ word: 'w', start: 0, end: 1 }] }
    ]);
    vi.spyOn(comicVideo, 'renderChapterClip').mockResolvedValue();
    vi.spyOn(comicVideo, 'concatChapterClips').mockResolvedValue();
    vi.spyOn(subtitle, 'generateASSSubtitles').mockReturnValue('sub');
    vi.spyOn(comicVideo, 'burnSubtitles').mockResolvedValue();

    const book = { id: 'book', title: 't', chapters: [{ id: 'ch1', title: 'c1', imagePath: 'i', narrationText: 't' }, { id: 'ch2', title: 'c2', imagePath: 'i', narrationText: 't' }] };
    const config = { outputDir: 'out', verticalWidth: 1080, verticalHeight: 1920, ttsVoice: 'voice' };

    const result = await runComicPipeline(book, config);
    expect(result.durationSec).toBe(10);
    expect(result.chapters).toBe(2);
  });

  it('should throw if no chapters', async () => {
    const book = { id: 'book', title: 't', chapters: [] };
    const config = { outputDir: 'out', verticalWidth: 1080, verticalHeight: 1920, ttsVoice: 'voice' };

    await expect(runComicPipeline(book, config)).rejects.toThrow('Comic book has no chapters to narrate');
  });

  it('should throw if chapter image missing', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    const book = { id: 'book', title: 't', chapters: [{ id: 'ch1', title: 'c1', imagePath: 'i', narrationText: 't' }] };
    const config = { outputDir: 'out', verticalWidth: 1080, verticalHeight: 1920, ttsVoice: 'voice' };

    await expect(runComicPipeline(book, config)).rejects.toThrow('Chapter image not found');
  });
});
