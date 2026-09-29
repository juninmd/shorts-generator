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

describe('comic-video', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockChapter = {
    id: 'chap1',
    imagePath: '/img/1.png',
    narrationText: 'Hello',
    audioPath: '/audio/1.mp3',
    durationSec: 5,
    words: []
  };

  it('should render chapter clip', async () => {
     const mod = await import('../../../src/core/comic/comic-video.js');
     await mod.renderChapterClip(mockChapter, '/out/clip.mp4', 1920, 1080);
     expect(child_process.execFile).toHaveBeenCalled();
  });

  it('should fallback ffmpegPath if not provided', async () => {
    const ffmpeg = (await import('fluent-ffmpeg')).default;
    (ffmpeg as any).ffmpegPath = vi.fn().mockReturnValue(undefined);

    const mod = await import('../../../src/core/comic/comic-video.js');
    await mod.renderChapterClip({ ...mockChapter, durationSec: 0 }, '/out/clip.mp4', 1920, 1080);
    expect(child_process.execFile).toHaveBeenCalled();
  });


  it('should concatenate chapter clips', async () => {
    vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);
    const mod = await import('../../../src/core/comic/comic-video.js');
    await mod.concatChapterClips(['/out/clip1.mp4', '/out/clip2.mp4'], '/out/concat.mp4', '/work');
    expect(fs.writeFileSync).toHaveBeenCalled();
    expect(child_process.execFile).toHaveBeenCalled();
  });

  it('should burn subtitles', async () => {
    const mod = await import('../../../src/core/comic/comic-video.js');
    await mod.burnSubtitles('/in.mp4', 'C:\\sub:title.ass', '/out.mp4');
    expect(child_process.execFile).toHaveBeenCalled();
  });
});
