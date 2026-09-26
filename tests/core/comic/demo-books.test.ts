import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as child_process from 'node:child_process';
import * as fs from 'node:fs';

vi.mock('node:fs');
vi.mock('node:child_process', () => {
    return {
        execFile: vi.fn((...args) => {
            const cb = args[args.length - 1];
            cb(null, {stdout: '', stderr: ''});
        })
    }
});

vi.mock('fluent-ffmpeg', () => ({
  default: {
    ffmpegPath: vi.fn().mockReturnValue('mock-ffmpeg')
  }
}));

describe('demo-books', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should buildFlashpointDemoBook', async () => {
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
    const mod = await import('../../../src/core/comic/demo-books.js');
    const result = await mod.buildFlashpointDemoBook('/work');
    expect(result.id).toBeDefined();
    expect(result.chapters.length).toBeGreaterThan(0);
    expect(child_process.execFile).toHaveBeenCalled();
  });

  it('should buildShrek1DemoBook', async () => {
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
    const mod = await import('../../../src/core/comic/demo-books.js');
    const result = await mod.buildShrek1DemoBook('/work');
    expect(result.id).toBeDefined();
    expect(result.chapters.length).toBeGreaterThan(0);
  });

  it('should buildFlashEpisode1DemoBook', async () => {
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
    const mod = await import('../../../src/core/comic/demo-books.js');
    const result = await mod.buildFlashEpisode1DemoBook('/work');
    expect(result.id).toBeDefined();
    expect(result.chapters.length).toBeGreaterThan(0);
  });

  it('should buildBiographyDemoBook', async () => {
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
    const mod = await import('../../../src/core/comic/demo-books.js');
    const result = await mod.buildBiographyDemoBook('/work');
    expect(result.id).toBeDefined();
    expect(result.chapters.length).toBeGreaterThan(0);
  });

  it('should buildNewsDigestDemoBook', async () => {
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
    const mod = await import('../../../src/core/comic/demo-books.js');
    const result = await mod.buildNewsDigestDemoBook('/work');
    expect(result.id).toBeDefined();
    expect(result.chapters.length).toBeGreaterThan(0);
  });

  it('should buildBookRecapDemoBook', async () => {
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
    const mod = await import('../../../src/core/comic/demo-books.js');
    const result = await mod.buildBookRecapDemoBook('/work');
    expect(result.id).toBeDefined();
    expect(result.chapters.length).toBeGreaterThan(0);
  });

  it('should build color card and fallback ffmpegPath', async () => {
    const ffmpeg = (await import('fluent-ffmpeg')).default;
    (ffmpeg as any).ffmpegPath = vi.fn().mockReturnValue(undefined);

    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
    const mod = await import('../../../src/core/comic/demo-books.js');
    const result = await mod.buildFlashpointDemoBook('/work');
    expect(child_process.execFile).toHaveBeenCalled();
  });
});
