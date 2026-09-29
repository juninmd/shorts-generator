import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as demoBooks from '../../../src/core/comic/demo-books.js';
import * as child_process from 'node:child_process';
import * as fs from 'node:fs';
import ffmpeg from 'fluent-ffmpeg';

vi.mock('node:child_process', () => ({
  execFile: vi.fn((cmd, args, opts, cb) => cb(null, { stdout: '', stderr: '' }))
}));
vi.mock('node:fs');
vi.mock('fluent-ffmpeg', () => ({
  default: {
    ffmpegPath: vi.fn(() => '/bin/ffmpeg')
  }
}));

describe('demo-books', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('buildFlashpointDemoBook', async () => {
    const book = await demoBooks.buildFlashpointDemoBook('/out');
    expect(book.id).toBe('flashpoint-demo');
    expect(book.chapters.length).toBe(3);
    expect(child_process.execFile).toHaveBeenCalledTimes(3);
  });

  it('buildShrek1DemoBook', async () => {
    const book = await demoBooks.buildShrek1DemoBook('/out');
    expect(book.id).toBe('shrek1-demo');
  });

  it('buildFlashEpisode1DemoBook', async () => {
    const book = await demoBooks.buildFlashEpisode1DemoBook('/out');
    expect(book.id).toBe('flash-s01e01-demo');
  });

  it('buildBiographyDemoBook', async () => {
    const book = await demoBooks.buildBiographyDemoBook('/out');
    expect(book.id).toBe('ada-lovelace-demo');
  });

  it('buildNewsDigestDemoBook', async () => {
    const book = await demoBooks.buildNewsDigestDemoBook('/out');
    expect(book.id).toBe('news-digest-demo');
  });

  it('buildBookRecapDemoBook', async () => {
    const book = await demoBooks.buildBookRecapDemoBook('/out');
    expect(book.id).toBe('dom-casmurro-demo');
  });

  it('falls back to ffmpeg command if ffmpegPath missing', async () => {
    vi.mocked(ffmpeg.ffmpegPath).mockReturnValue(undefined as any);
    await demoBooks.buildFlashpointDemoBook('/out');
    expect(child_process.execFile).toHaveBeenCalledWith('ffmpeg', expect.any(Array), expect.any(Object), expect.any(Function));
  });
});
