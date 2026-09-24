import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as comicPipeline from '../../../src/core/comic/comic-pipeline.js';
import * as comicTts from '../../../src/core/comic/comic-tts.js';
import * as comicVideo from '../../../src/core/comic/comic-video.js';
import * as subtitle from '../../../src/core/subtitle.js';
import * as logger from '../../../src/core/logger.js';
import fs from 'node:fs';

vi.mock('../../../src/core/comic/comic-tts.js');
vi.mock('../../../src/core/comic/comic-video.js');
vi.mock('../../../src/core/subtitle.js');
vi.mock('../../../src/core/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn() }
}));
vi.mock('node:fs');

describe('comic-pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws if book has no chapters', async () => {
    await expect(comicPipeline.runComicPipeline({ id: '1', title: 'Test', chapters: [] }, { outputDir: '', verticalWidth: 1080, verticalHeight: 1920, ttsVoice: '' }))
      .rejects.toThrow('Comic book has no chapters to narrate');
  });

  it('throws if chapter image does not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    await expect(comicPipeline.runComicPipeline({
      id: '1', title: 'Test', chapters: [{ id: 'c1', title: 'Ch 1', imagePath: 'nonexistent.jpg', narrationText: 'text' }]
    }, { outputDir: '', verticalWidth: 1080, verticalHeight: 1920, ttsVoice: '' }))
      .rejects.toThrow('Chapter image not found: nonexistent.jpg');
  });

  it('runs pipeline successfully', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(comicTts.narrateChapters).mockResolvedValue([{
      id: 'c1', title: 'Ch 1', imagePath: 'exists.jpg', narrationText: 'text',
      audioPath: 'audio.mp3', durationSec: 10, words: [{ word: 'test', start: 0, end: 1 }]
    }]);
    vi.mocked(subtitle.generateASSSubtitles).mockReturnValue('subs');

    const result = await comicPipeline.runComicPipeline({
      id: 'book1', title: 'Test Book', chapters: [{ id: 'c1', title: 'Ch 1', imagePath: 'exists.jpg', narrationText: 'text' }]
    }, { outputDir: '/out', verticalWidth: 1080, verticalHeight: 1920, ttsVoice: 'voice' });

    expect(result.bookTitle).toBe('Test Book');
    expect(result.durationSec).toBe(10);
    expect(comicTts.narrateChapters).toHaveBeenCalled();
    expect(comicVideo.renderChapterClip).toHaveBeenCalled();
    expect(comicVideo.concatChapterClips).toHaveBeenCalled();
    expect(comicVideo.burnSubtitles).toHaveBeenCalled();
  });
});
