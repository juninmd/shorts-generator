import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as comicTts from '../../../src/core/comic/comic-tts.js';
import * as child_process from 'node:child_process';
import * as fs from 'node:fs';
import ffmpeg from 'fluent-ffmpeg';

vi.mock('node:child_process', () => ({
  execFile: vi.fn((cmd, args, opts, cb) => cb(null, { stdout: '', stderr: '' }))
}));
vi.mock('node:fs');
vi.mock('fluent-ffmpeg', () => ({
  default: {
    ffprobe: vi.fn()
  }
}));

describe('comic-tts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws if python script is missing', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    await expect(comicTts.narrateChapter({ id: '1', title: 'T', imagePath: 'i', narrationText: 't' }, '/out', 'voice'))
      .rejects.toThrow(/Missing TTS helper script:/);
  });

  it('narrates a chapter successfully', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify([{ word: 'test', start: 0, end: 1 }]));

    vi.mocked(ffmpeg.ffprobe).mockImplementation((path, cb) => {
      cb(null, { format: { duration: 5 } });
    });

    const result = await comicTts.narrateChapter({ id: '1', title: 'T', imagePath: 'i', narrationText: 't' }, '/out', 'voice');
    expect(result.durationSec).toBe(5);
    expect(result.words.length).toBe(1);
  });

  it('handles missing duration in ffprobe', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('[]');

    vi.mocked(ffmpeg.ffprobe).mockImplementation((path, cb) => {
      cb(null, {});
    });

    const result = await comicTts.narrateChapter({ id: '1', title: 'T', imagePath: 'i', narrationText: 't' }, '/out', 'voice');
    expect(result.durationSec).toBe(0);
  });

  it('rejects if ffprobe fails', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('[]');

    vi.mocked(ffmpeg.ffprobe).mockImplementation((path, cb) => {
      cb(new Error('ffprobe failed'), null);
    });

    await expect(comicTts.narrateChapter({ id: '1', title: 'T', imagePath: 'i', narrationText: 't' }, '/out', 'voice'))
      .rejects.toThrow('ffprobe failed');
  });

  it('narrates multiple chapters', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('[]');
    vi.mocked(ffmpeg.ffprobe).mockImplementation((path, cb) => cb(null, { format: { duration: 2 } }));

    const chapters = [
      { id: '1', title: 'T1', imagePath: 'i1', narrationText: 't1' },
      { id: '2', title: 'T2', imagePath: 'i2', narrationText: 't2' }
    ];
    const results = await comicTts.narrateChapters(chapters, '/out', 'voice');
    expect(results.length).toBe(2);
  });
});
