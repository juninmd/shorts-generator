import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as comicTts from '../../../src/core/comic/comic-tts.js';
import * as fs from 'node:fs';
import * as child_process from 'node:child_process';
import ffmpeg from 'fluent-ffmpeg';

vi.mock('node:fs');
vi.mock('node:child_process');
vi.mock('fluent-ffmpeg');

describe('comic-tts', () => {
  const chapter = { id: 'ch1', title: 'T', imagePath: 'i', narrationText: 'text' };

  function setupMocks(duration = 10, probeError = null) {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined);
    vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify([{ word: 'w', start: 0, end: 1 }]));

    vi.spyOn(child_process, 'execFile').mockImplementation((cmd, args, opts, cb) => {
       const callback = typeof opts === 'function' ? opts : cb;
       if (typeof callback === 'function') callback(null, { stdout: '', stderr: '' } as any);
       return {} as any;
    });

    vi.mocked(ffmpeg.ffprobe).mockImplementation((file, cb) => {
        if (typeof cb === 'function') {
           if (probeError) cb(probeError as any, {} as any);
           else cb(null, duration !== null ? { format: { duration } } as any : {} as any);
        }
    });
  }

  beforeEach(() => {
    vi.resetAllMocks();
    process.env.PYTHON_BIN = 'python';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should throw if helper script missing', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    await expect(comicTts.narrateChapter(chapter, 'out', 'voice'))
      .rejects.toThrow('Missing TTS helper script');
  });

  it('should narrate a chapter', async () => {
    setupMocks();
    const result = await comicTts.narrateChapter(chapter, 'out', 'voice');
    expect(result.durationSec).toBe(10);
    expect(result.words).toHaveLength(1);
    expect(result.audioPath).toContain('ch1.mp3');
  });

  it('should fallback python if missing', async () => {
    delete process.env.PYTHON_BIN;
    setupMocks(null);
    vi.spyOn(fs, 'readFileSync').mockReturnValue('[]');
    const result = await comicTts.narrateChapter(chapter, 'out', 'voice');
    expect(result.durationSec).toBe(0);
  });

  it('should reject if ffprobe errors', async () => {
    setupMocks(10, new Error('ffprobe error'));
    await expect(comicTts.narrateChapter(chapter, 'out', 'voice'))
      .rejects.toThrow('ffprobe error');
  });

  it('should narrate multiple chapters', async () => {
    setupMocks(5);
    vi.spyOn(fs, 'readFileSync').mockReturnValue('[]');
    const results = await comicTts.narrateChapters([chapter, { ...chapter, id: 'ch2' }], 'out', 'voice');
    expect(results).toHaveLength(2);
    expect(results[0].durationSec).toBe(5);
  });
});
