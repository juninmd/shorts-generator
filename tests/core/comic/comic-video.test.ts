import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as comicVideo from '../../../src/core/comic/comic-video.js';
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
vi.mock('../../../src/core/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn() }
}));

describe('comic-video', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a chapter clip', async () => {
    await comicVideo.renderChapterClip(
      { id: '1', title: 'T', imagePath: 'i', narrationText: 't', audioPath: 'a', durationSec: 5, words: [] },
      '/out.mp4', 1080, 1920
    );
    expect(child_process.execFile).toHaveBeenCalledWith('/bin/ffmpeg', expect.any(Array), expect.any(Object), expect.any(Function));
  });

  it('concats chapter clips', async () => {
    await comicVideo.concatChapterClips(['/clip1.mp4', '/clip2.mp4'], '/out.mp4', '/work');
    expect(fs.writeFileSync).toHaveBeenCalled();
    expect(child_process.execFile).toHaveBeenCalledWith('/bin/ffmpeg', expect.any(Array), expect.any(Object), expect.any(Function));
  });

  it('burns subtitles', async () => {
    await comicVideo.burnSubtitles('/in.mp4', '/subs.ass', '/out.mp4');
    expect(child_process.execFile).toHaveBeenCalledWith('/bin/ffmpeg', expect.any(Array), expect.any(Object), expect.any(Function));
  });

  it('falls back if ffmpegPath is undefined', async () => {
    vi.mocked(ffmpeg.ffmpegPath).mockReturnValue(undefined as any);
    await comicVideo.burnSubtitles('/in.mp4', '/subs.ass', '/out.mp4');
    expect(child_process.execFile).toHaveBeenCalledWith('ffmpeg', expect.any(Array), expect.any(Object), expect.any(Function));
  });
});
