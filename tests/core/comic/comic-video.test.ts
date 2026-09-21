import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as comicVideo from '../../../src/core/comic/comic-video.js';
import * as fs from 'node:fs';
import * as child_process from 'node:child_process';
import ffmpeg from 'fluent-ffmpeg';

vi.mock('node:fs');
vi.mock('node:child_process');
vi.mock('fluent-ffmpeg');

describe('comic-video', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render chapter clip', async () => {
    vi.spyOn(child_process, 'execFile').mockImplementation((cmd, args, opts, cb) => {
       if (typeof cb === 'function') cb(null, { stdout: '', stderr: '' });
       return {} as any;
    });

    const chapter = {
      id: '1', title: 'a', imagePath: 'i', narrationText: 't',
      audioPath: 'a', durationSec: 1, words: []
    };
    await expect(comicVideo.renderChapterClip(chapter, 'out.mp4', 1920, 1080)).resolves.not.toThrow();
  });

  it('should get ffmpeg path correctly', async () => {
    const mockFfmpegPath = vi.fn().mockReturnValue('custom-ffmpeg');
    (ffmpeg as any).ffmpegPath = mockFfmpegPath;

    vi.spyOn(child_process, 'execFile').mockImplementation((cmd, args, opts, cb) => {
       if (typeof cb === 'function') cb(null, { stdout: '', stderr: '' });
       return {} as any;
    });
    const chapter = {
      id: '1', title: 'a', imagePath: 'i', narrationText: 't',
      audioPath: 'a', durationSec: 1, words: []
    };
    await expect(comicVideo.renderChapterClip(chapter, 'out.mp4', 1920, 1080)).resolves.not.toThrow();

    delete (ffmpeg as any).ffmpegPath;
  });

  it('should get ffmpeg path fallback', async () => {
    delete (ffmpeg as any).ffmpegPath;
    vi.spyOn(child_process, 'execFile').mockImplementation((cmd, args, opts, cb) => {
       if (typeof cb === 'function') cb(null, { stdout: '', stderr: '' });
       return {} as any;
    });
    const chapter = {
      id: '1', title: 'a', imagePath: 'i', narrationText: 't',
      audioPath: 'a', durationSec: 1, words: []
    };
    await expect(comicVideo.renderChapterClip(chapter, 'out.mp4', 1920, 1080)).resolves.not.toThrow();
  });

  it('should concat chapter clips', async () => {
    vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined);
    vi.spyOn(child_process, 'execFile').mockImplementation((cmd, args, opts, cb) => {
       if (typeof cb === 'function') cb(null, { stdout: '', stderr: '' });
       return {} as any;
    });
    await expect(comicVideo.concatChapterClips(['c1.mp4', 'c2.mp4'], 'out.mp4', 'work')).resolves.not.toThrow();
  });

  it('should burn subtitles', async () => {
    vi.spyOn(child_process, 'execFile').mockImplementation((cmd, args, opts, cb) => {
       if (typeof cb === 'function') cb(null, { stdout: '', stderr: '' });
       return {} as any;
    });
    await expect(comicVideo.burnSubtitles('in.mp4', 'c:\\sub.ass', 'out.mp4')).resolves.not.toThrow();
  });
});
