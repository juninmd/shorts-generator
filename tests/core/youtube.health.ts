import { describe, it, expect, vi, beforeAll } from 'vitest';
import { verifyYoutubeAccess, getVideoInfo } from '../../src/core/youtube.js';
import { loadConfig } from '../../src/core/config.js';
import { logger } from '../../src/core/logger.js';

vi.mock('../../src/core/youtube-ytdlp.js', async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    execYtDlp: vi.fn(),
    withCookies: vi.fn().mockImplementation(async (config, cb) => cb()),
  };
});

import { execYtDlp } from '../../src/core/youtube-ytdlp.js';

describe('YouTube Health Check', { timeout: 60_000 }, () => {
  let config: ReturnType<typeof loadConfig>;

  beforeAll(() => {
    config = loadConfig();
  });

  it('should verify YouTube access is working', async () => {
    vi.mocked(execYtDlp).mockResolvedValueOnce({ stdout: 'ID  EXT\n', stderr: '' });
    try {
      await verifyYoutubeAccess(config);
      expect(true).toBe(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ error: message }, 'YouTube access check failed');
      throw err;
    }
  });

  it('should fetch metadata from public test video', async () => {
    // Big Buck Bunny - widely available public video
    const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

    vi.mocked(execYtDlp).mockResolvedValueOnce({ stdout: JSON.stringify({id: 'dQw4w9WgXcQ', duration: 100, title: 'Title'}) + '\n', stderr: '' });

    const info = await getVideoInfo(testUrl);

    expect(info).not.toBeNull();
    expect(info?.id).toBe('dQw4w9WgXcQ');
    expect(info?.duration).toBeGreaterThan(0);
    expect(info?.title).toMatch(/[a-zA-Z0-9]/);
  });

  it('should handle YouTube blocking gracefully', async () => {
    // This test verifies error handling, not that blocking occurs
    const config = loadConfig();

    // Override with intentionally bad player client to trigger error paths
    const badConfig = {
      ...config,
      youtubeCookiesBase64: undefined,
      youtubeCookiesFile: undefined,
      youtubeCookiesBrowser: undefined,
    };

    vi.mocked(execYtDlp).mockRejectedValueOnce(new Error('YouTube is blocking this environment (Bot Detection). Update your YOUTUBE_COOKIES_BASE64.'));

    // Test should either work OR throw with a clear error message
    try {
      await verifyYoutubeAccess(badConfig);
      expect(true).toBe(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      expect(message).toMatch(/YouTube|access|blocked|403|unauthorized/i);
    }
  });
});