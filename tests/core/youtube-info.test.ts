import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyYoutubeAccess, getVideoInfo, getVideoFileSize } from '../../src/core/youtube-info.js';
import { execYtDlp } from '../../src/core/youtube-ytdlp.js';

vi.mock('../../src/core/youtube-ytdlp.js', () => ({
  execYtDlp: vi.fn(),
  withCookies: vi.fn().mockImplementation(async (config, callback) => callback('mock-cookie')),
  getYtDlpBaseArgs: vi.fn().mockReturnValue([])
}));

describe('youtube-info', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('verifyYoutubeAccess', () => {
    it('returns successfully if formats are found', async () => {
      vi.mocked(execYtDlp).mockResolvedValue({ stdout: 'ID EXT', stderr: '' } as any);
      await expect(verifyYoutubeAccess({} as any)).resolves.toBeUndefined();
    });

    it('throws custom error if no ID/EXT found in output', async () => {
      vi.mocked(execYtDlp).mockResolvedValue({ stdout: 'Some string without formats', stderr: '' } as any);
      await expect(verifyYoutubeAccess({} as any)).rejects.toThrow('YouTube formats not found');
    });

    it('throws Bot Detection error on specific stderr strings', async () => {
      // Must reject with an Error object, not a raw dict, because the code does `error instanceof Error ? error.stderr : String(error)`
      const err = new Error('fail') as any;
      err.stderr = 'Sign in to confirm you are not a bot';
      vi.mocked(execYtDlp).mockRejectedValue(err);
      await expect(verifyYoutubeAccess({} as any)).rejects.toThrow('YouTube is blocking this environment');
    });

    it('throws Bot Detection error on 403 forbidden', async () => {
      vi.mocked(execYtDlp).mockRejectedValue(new Error('403: forbidden'));
      await expect(verifyYoutubeAccess({} as any)).rejects.toThrow('YouTube is blocking this environment');
    });

    it('throws specific error on no formats found string', async () => {
      const err = new Error('fail') as any;
      err.stderr = 'No video formats found';
      vi.mocked(execYtDlp).mockRejectedValue(err);
      await expect(verifyYoutubeAccess({} as any)).rejects.toThrow('YouTube is blocking streaming access from this IP. (No formats found).');
    });

    it('extracts ERROR line from yt-dlp string', async () => {
      vi.mocked(execYtDlp).mockRejectedValue(new Error('Some stuff\nERROR: Youtube is unhappy\nOther stuff'));
      await expect(verifyYoutubeAccess({} as any)).rejects.toThrow('ERROR: Youtube is unhappy');
    });

    it('handles falsy error object in catch block', async () => {
      vi.mocked(execYtDlp).mockRejectedValue('');
      await expect(verifyYoutubeAccess({} as any)).rejects.toThrow('YouTube access check failed:');
    });
  });

  describe('getVideoInfo', () => {
    it('returns info successfully', async () => {
      vi.mocked(execYtDlp).mockResolvedValue({
        stdout: JSON.stringify({
          id: '123',
          title: 'Title',
          webpage_url: 'http://url',
          channel: 'Channel',
          channel_url: 'http://ch',
          duration: 100,
          upload_date: '20230101',
          thumbnail: 'http://thumb',
          live_status: 'none',
          categories: ['Cat']
        }),
        stderr: ''
      } as any);

      const info = await getVideoInfo('https://youtube.com/watch?v=123');
      expect(info?.id).toBe('123');
      expect(info?.title).toBe('Title');
    });

    it('returns null on execYtDlp throw', async () => {
      vi.mocked(execYtDlp).mockRejectedValue(new Error('error'));
      const info = await getVideoInfo('https://youtube.com/watch?v=123');
      expect(info).toBeNull();
    });

    it('returns null if JSON is invalid', async () => {
      vi.mocked(execYtDlp).mockResolvedValue({ stdout: 'Not a JSON', stderr: '' } as any);
      const info = await getVideoInfo('https://youtube.com/watch?v=123');
      expect(info).toBeNull();
    });

    it('handles NA replacement correctly', async () => {
      vi.mocked(execYtDlp).mockResolvedValue({
        stdout: '{"id": "123", "duration": NA}',
        stderr: ''
      } as any);
      const info = await getVideoInfo('https://youtube.com/watch?v=123');
      expect(info?.duration).toBe(0);
    });

    it('defaults fields if missing in JSON', async () => {
      vi.mocked(execYtDlp).mockResolvedValue({
        stdout: JSON.stringify({ id: '123' }),
        stderr: ''
      } as any);
      const info = await getVideoInfo('https://youtube.com/watch?v=123');
      expect(info?.title).toBe('Untitled');
      expect(info?.channelName).toBe('Unknown');
      expect(info?.duration).toBe(0);
    });
  });

  describe('getVideoFileSize', () => {
    it('returns size from stdout', async () => {
      vi.mocked(execYtDlp).mockResolvedValue({ stdout: '50000', stderr: '' } as any);
      const size = await getVideoFileSize('https://youtube.com/watch?v=123', {} as any);
      expect(size).toBe(50000);
    });

    it('returns null on NA', async () => {
      vi.mocked(execYtDlp).mockResolvedValue({ stdout: 'NA\n', stderr: '' } as any);
      const size = await getVideoFileSize('https://youtube.com/watch?v=123', {} as any);
      expect(size).toBeNull();
    });

    it('returns null on exec error', async () => {
      vi.mocked(execYtDlp).mockRejectedValue(new Error('fail'));
      const size = await getVideoFileSize('https://youtube.com/watch?v=123', {} as any);
      expect(size).toBeNull();
    });

    it('returns null on invalid integer', async () => {
      vi.mocked(execYtDlp).mockResolvedValue({ stdout: 'unknown\n', stderr: '' } as any);
      const size = await getVideoFileSize('https://youtube.com/watch?v=123', {} as any);
      expect(size).toBeNull();
    });
  });
});
