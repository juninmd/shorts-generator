import { describe, expect, it, vi, beforeEach } from 'vitest';
import { getChannelVideos, getTopChannelVideos } from '../../src/core/youtube-channel.js';
import * as ytdlp from '../../src/core/youtube-ytdlp.js';

vi.mock('../../src/core/youtube-ytdlp.js', () => ({
  getYtDlpBaseArgs: vi.fn(() => []),
  withCookies: vi.fn(async (_, cb) => cb('mock-cookie')),
  execYtDlp: vi.fn(),
}));

describe('youtube-channel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getChannelVideos', () => {
    it('should parse valid videos and filter out invalid ones', async () => {
      vi.mocked(ytdlp.execYtDlp).mockResolvedValue({
        stdout: `
{"id":"vid1","title":"Title 1","webpage_url":"url1","channel":"chan","channel_url":"chanurl","duration":100,"upload_date":"date","thumbnail":"thumb","live_status":null}
{"id":"vid2","duration":NA,"live_status":"is_upcoming"}

{"id":"vid3"}
`,
        stderr: '',
      });
      const result = await getChannelVideos('test-channel', 10);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('vid1');
    });

    it('should handle URL as identifier', async () => {
      vi.mocked(ytdlp.execYtDlp).mockResolvedValue({ stdout: '', stderr: '' });
      await getChannelVideos('http://test', 10);
      expect(ytdlp.execYtDlp).toHaveBeenCalledWith(
        expect.arrayContaining(['http://test']),
        expect.any(Object)
      );
    });

    it('should handle parse errors and continue', async () => {
      vi.mocked(ytdlp.execYtDlp).mockResolvedValue({
        stdout: 'invalid json\n{"id":"vid1","duration":100}',
        stderr: '',
      });
      const result = await getChannelVideos('test', 10);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('vid1');
    });

    it('should return empty array on exec error', async () => {
      vi.mocked(ytdlp.execYtDlp).mockRejectedValue(new Error('exec failed'));
      const result = await getChannelVideos('test', 10);
      expect(result).toEqual([]);
    });
  });

  describe('getTopChannelVideos', () => {
    it('should sort by view count and filter properly', async () => {
      vi.mocked(ytdlp.execYtDlp).mockResolvedValue({
        stdout: `
{"id":"vid1","duration":100,"view_count":50}
{"id":"vid2","duration":100,"view_count":100}
{"id":"vid3","duration":NA}
{"id":"vid4","duration":100,"live_status":"is_upcoming"}
`,
        stderr: '',
      });
      const result = await getTopChannelVideos('test-channel', 10);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('vid2');
      expect(result[1].id).toBe('vid1');
    });

    it('should handle URL as identifier', async () => {
      vi.mocked(ytdlp.execYtDlp).mockResolvedValue({ stdout: '', stderr: '' });
      await getTopChannelVideos('http://test', 10);
      expect(ytdlp.execYtDlp).toHaveBeenCalledWith(
        expect.arrayContaining(['http://test']),
        expect.any(Object)
      );
    });

    it('should handle parse errors and continue', async () => {
      vi.mocked(ytdlp.execYtDlp).mockResolvedValue({
        stdout: 'invalid json\n{"id":"vid1","duration":100}',
        stderr: '',
      });
      const result = await getTopChannelVideos('test', 10);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('vid1');
    });

    it('should return empty array on exec error', async () => {
      vi.mocked(ytdlp.execYtDlp).mockRejectedValue(new Error('exec failed'));
      const result = await getTopChannelVideos('test', 10);
      expect(result).toEqual([]);
    });
  });
});

  describe('getTopChannelVideos viewCount fallback', () => {
    it('should fallback to 0 if viewCount is undefined or missing', async () => {
      vi.mocked(ytdlp.execYtDlp).mockResolvedValue({
        stdout: `
{"id":"vid1","duration":100}
`,
        stderr: '',
      });
      const result = await getTopChannelVideos('test-channel', 10);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('vid1');
      expect(result[0].viewCount).toBe(0);
    });
  });

  describe('getTopChannelVideos sorting fallback', () => {
    it('should sort correctly when a viewCount is undefined or 0', async () => {
      vi.mocked(ytdlp.execYtDlp).mockResolvedValue({
        stdout: `
{"id":"vid1","duration":100,"view_count":NA}
{"id":"vid2","duration":100,"view_count":0}
{"id":"vid3","duration":100,"view_count":50}
`,
        stderr: '',
      });
      const result = await getTopChannelVideos('test-channel', 10);
      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('vid3');
    });
  });
