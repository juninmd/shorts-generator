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
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined);
    vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify([{ word: 'w', start: 0, end: 1 }]));

    vi.spyOn(child_process, 'execFile').mockImplementation((cmd, args, opts, cb) => {
       if (typeof opts === 'function') opts(null, { stdout: '', stderr: '' });
       else if (typeof cb === 'function') cb(null, { stdout: '', stderr: '' });
       return {} as any;
    });

    vi.mocked(ffmpeg.ffprobe).mockImplementation((file, cb) => {
        if (typeof cb === 'function') {
           cb(null, { format: { duration: 10 } } as any);
        }
    });

    const result = await comicTts.narrateChapter(chapter, 'out', 'voice');
    expect(result.durationSec).toBe(10);
    expect(result.words).toHaveLength(1);
    expect(result.audioPath).toContain('ch1.mp3');
  });

  it('should fallback python if missing', async () => {
    delete process.env.PYTHON_BIN;
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined);
    vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined);
    vi.spyOn(fs, 'readFileSync').mockReturnValue('[]');
    vi.spyOn(child_process, 'execFile').mockImplementation((cmd, args, opts, cb) => {
       if (typeof opts === 'function') opts(null, { stdout: '', stderr: '' });
       else if (typeof cb === 'function') cb(null, { stdout: '', stderr: '' });
       return {} as any;
    });
    vi.mocked(ffmpeg.ffprobe).mockImplementation((file, cb) => {
        if (typeof cb === 'function') {
           cb(null, {} as any);
        }
    });

    const result = await comicTts.narrateChapter(chapter, 'out', 'voice');
    expect(result.durationSec).toBe(0);
  });

  it('should reject if ffprobe errors', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined);
    vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined);
    vi.spyOn(fs, 'readFileSync').mockReturnValue('[]');
    vi.spyOn(child_process, 'execFile').mockImplementation((cmd, args, opts, cb) => {
       if (typeof cb === 'function') cb(null, { stdout: '', stderr: '' });
       return {} as any;
    });
    vi.mocked(ffmpeg.ffprobe).mockImplementation((file, cb) => {
        if (typeof cb === 'function') {
           cb(new Error('ffprobe error'), {} as any);
        }
    });

    await expect(comicTts.narrateChapter(chapter, 'out', 'voice'))
      .rejects.toThrow('ffprobe error');
  });

  it('should narrate multiple chapters', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined);
    vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined);
    vi.spyOn(fs, 'readFileSync').mockReturnValue('[]');
    vi.spyOn(child_process, 'execFile').mockImplementation((cmd, args, opts, cb) => {
       if (typeof cb === 'function') cb(null, { stdout: '', stderr: '' });
       return {} as any;
    });
    vi.mocked(ffmpeg.ffprobe).mockImplementation((file, cb) => {
        if (typeof cb === 'function') {
           cb(null, { format: { duration: 5 } } as any);
        }
    });

    const results = await comicTts.narrateChapters([chapter, { ...chapter, id: 'ch2' }], 'out', 'voice');
    expect(results).toHaveLength(2);
    expect(results[0].durationSec).toBe(5);
  });
});
