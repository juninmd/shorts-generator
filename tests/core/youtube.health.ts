import { describe, it, expect, beforeAll, vi } from 'vitest';
import { verifyYoutubeAccess, getVideoInfo } from '../../src/core/youtube.js';
import { loadConfig } from '../../src/core/config.js';
import { logger } from '../../src/core/logger.js';

vi.mock('../../src/core/youtube-ytdlp.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/core/youtube-ytdlp.js')>();
  return {
    ...mod,
    withCookies: vi.fn(async (config, callback) => {
      return callback();
    }),
    execYtDlp: vi.fn(async (args) => {
      if (args.includes('dQw4w9WgXcQ') || args.includes('https://www.youtube.com/watch?v=dQw4w9WgXcQ')) {
        return { stdout: JSON.stringify({ id: 'dQw4w9WgXcQ', duration: 212, title: 'Rick Astley - Never Gonna Give You Up (Official Music Video)' }) };
      }
      return { stdout: 'ID\nEXT\nformat 1\nformat 2' };
    }),
    getYtDlpBaseArgs: vi.fn().mockReturnValue([])
  };
});

describe('YouTube Health Check', { timeout: 60_000 }, () => {
  let config: ReturnType<typeof loadConfig>;

  beforeAll(() => {
    config = loadConfig();
  });

  it('should verify YouTube access is working', async () => {
    // Re-mock specifically for this test case because args are different here
    const { execYtDlp } = await import('../../src/core/youtube-ytdlp.js');
    vi.mocked(execYtDlp).mockResolvedValueOnce({ stdout: 'ID\nEXT\nformat 1\nformat 2' });

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

    // Need to mock specifically for this to return JSON
    const { execYtDlp } = await import('../../src/core/youtube-ytdlp.js');
    vi.mocked(execYtDlp).mockResolvedValueOnce({ stdout: JSON.stringify({ id: 'dQw4w9WgXcQ', duration: 212, title: 'Rick Astley - Never Gonna Give You Up (Official Music Video)' }) });

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

    // We can mock execYtDlp for this test specifically to throw the expected error
    const { execYtDlp } = await import('../../src/core/youtube-ytdlp.js');
    vi.mocked(execYtDlp).mockRejectedValueOnce(new Error('YouTube access blocked 403'));

    // Test should either work OR throw with a clear error message
    try {
      await verifyYoutubeAccess(badConfig);
      expect(true).toBe(false); // Should not reach here
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      expect(message).toMatch(/YouTube|access|blocked|403|unauthorized/i);
    }
  });
});
