import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as demoBooks from '../../../src/core/comic/demo-books.js';
import * as fs from 'node:fs';
import * as child_process from 'node:child_process';
import ffmpeg from 'fluent-ffmpeg';

vi.mock('node:fs');
vi.mock('node:child_process');
vi.mock('fluent-ffmpeg');

describe('demo-books', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined);
    vi.spyOn(child_process, 'execFile').mockImplementation((cmd, args, opts, cb) => {
       if (typeof cb === 'function') cb(null, { stdout: '', stderr: '' });
       return {} as any;
    });
  });

  it('should buildFlashpointDemoBook', async () => {
    const book = await demoBooks.buildFlashpointDemoBook('work');
    expect(book.id).toBe('flashpoint-demo');
    expect(book.chapters).toHaveLength(3);
  });

  it('should buildShrek1DemoBook', async () => {
    const book = await demoBooks.buildShrek1DemoBook('work');
    expect(book.id).toBe('shrek1-demo');
    expect(book.chapters).toHaveLength(3);
  });

  it('should buildFlashEpisode1DemoBook', async () => {
    const book = await demoBooks.buildFlashEpisode1DemoBook('work');
    expect(book.id).toBe('flash-s01e01-demo');
    expect(book.chapters).toHaveLength(3);
  });

  it('should buildBiographyDemoBook', async () => {
    const book = await demoBooks.buildBiographyDemoBook('work');
    expect(book.id).toBe('ada-lovelace-demo');
    expect(book.chapters).toHaveLength(3);
  });

  it('should buildNewsDigestDemoBook', async () => {
    const book = await demoBooks.buildNewsDigestDemoBook('work');
    expect(book.id).toBe('news-digest-demo');
    expect(book.chapters).toHaveLength(3);
  });

  it('should buildBookRecapDemoBook', async () => {
    const book = await demoBooks.buildBookRecapDemoBook('work');
    expect(book.id).toBe('dom-casmurro-demo');
    expect(book.chapters).toHaveLength(3);
  });
});
