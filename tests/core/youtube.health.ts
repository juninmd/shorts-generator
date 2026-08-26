import { describe, it, expect, beforeAll } from 'vitest';
import { verifyYoutubeAccess, getVideoInfo } from '../../src/core/youtube.js';
import { loadConfig } from '../../src/core/config.js';
import { logger } from '../../src/core/logger.js';

describe('YouTube Health Check', { timeout: 60_000 }, () => {
  let config: ReturnType<typeof loadConfig>;

  beforeAll(() => {
    config = loadConfig();
  });

  it('should verify YouTube access is working', async () => {
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
    const testUrl = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ';

    const info = await getVideoInfo(testUrl);

    expect(info).not.toBeNull();
    expect(info?.id).toBe('aqz-KE-bpKQ');
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
