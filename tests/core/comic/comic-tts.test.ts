import { describe, it, expect, vi, beforeEach } from 'vitest';
import { narrateChapter, narrateChapters } from '../../../src/core/comic/comic-tts.js';
import * as fs from 'node:fs';
import * as child_process from 'node:child_process';
import ffmpeg from 'fluent-ffmpeg';

vi.mock('node:fs');
vi.mock('node:child_process');
vi.mock('fluent-ffmpeg', () => ({
  default: {
    ffprobe: vi.fn(),
  },
}));

describe('comic-tts', () => {
  const mockChapter = {
    id: 'chap1',
    imagePath: '/img',
    narrationText: 'Hello world',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should narrate a chapter successfully', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
    vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);

    vi.mocked(child_process.execFile).mockImplementation((...args: any[]) => {
      const cb = args[args.length - 1];
      cb(null, { stdout: '', stderr: '' });
      return {} as any;
    });

    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify([{ word: 'Hello', start: 0, end: 1 }]));

    vi.mocked(ffmpeg.ffprobe as any).mockImplementation((file: string, cb: any) => {
      cb(null, { format: { duration: 5 } });
    });

    const result = await narrateChapter(mockChapter, '/out', 'voice1');
    expect(result.durationSec).toBe(5);
    expect(result.words.length).toBe(1);
  });

  it('should handle ffprobe error', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
    vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);

    vi.mocked(child_process.execFile).mockImplementation((...args: any[]) => {
      const cb = args[args.length - 1];
      cb(null, { stdout: '', stderr: '' });
      return {} as any;
    });

    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify([{ word: 'Hello', start: 0, end: 1 }]));

    vi.mocked(ffmpeg.ffprobe as any).mockImplementation((file: string, cb: any) => {
      cb(new Error('ffprobe fail'), null);
    });

    await expect(narrateChapter(mockChapter, '/out', 'voice1')).rejects.toThrow('ffprobe fail');
  });

  it('should use default duration if ffprobe metadata is missing', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
    vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);

    vi.mocked(child_process.execFile).mockImplementation((...args: any[]) => {
      const cb = args[args.length - 1];
      cb(null, { stdout: '', stderr: '' });
      return {} as any;
    });

    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify([{ word: 'Hello', start: 0, end: 1 }]));

    vi.mocked(ffmpeg.ffprobe as any).mockImplementation((file: string, cb: any) => {
      cb(null, {});
    });

    const result = await narrateChapter(mockChapter, '/out', 'voice1');
    expect(result.durationSec).toBe(0);
  });

  it('should throw if script is missing', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    await expect(narrateChapter(mockChapter, '/out', 'voice1')).rejects.toThrow('Missing TTS helper script');
  });

  it('should narrate multiple chapters', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
    vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);

    vi.mocked(child_process.execFile).mockImplementation((...args: any[]) => {
      const cb = args[args.length - 1];
      cb(null, { stdout: '', stderr: '' });
      return {} as any;
    });

    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify([{ word: 'Hello', start: 0, end: 1 }]));

    vi.mocked(ffmpeg.ffprobe as any).mockImplementation((file: string, cb: any) => {
      cb(null, { format: { duration: 5 } });
    });

    const results = await narrateChapters([mockChapter, { ...mockChapter, id: 'chap2' }], '/out', 'voice1');
    expect(results.length).toBe(2);
  });
});
