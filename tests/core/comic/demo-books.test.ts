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
       if (typeof cb === 'function') cb(null, { stdout: '', stderr: '' } as any);
       return {} as any;
    });
  });

  const testCases = [
    { method: 'buildFlashpointDemoBook', expectedId: 'flashpoint-demo' },
    { method: 'buildShrek1DemoBook', expectedId: 'shrek1-demo' },
    { method: 'buildFlashEpisode1DemoBook', expectedId: 'flash-s01e01-demo' },
    { method: 'buildBiographyDemoBook', expectedId: 'ada-lovelace-demo' },
    { method: 'buildNewsDigestDemoBook', expectedId: 'news-digest-demo' },
    { method: 'buildBookRecapDemoBook', expectedId: 'dom-casmurro-demo' }
  ];

  it.each(testCases)('should build $method correctly', async ({ method, expectedId }) => {
    const fn = (demoBooks as any)[method];
    const book = await fn('work');
    expect(book.id).toBe(expectedId);
    expect(book.chapters).toHaveLength(3);
  });
});
