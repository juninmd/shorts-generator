import { describe, it, expect, vi } from 'vitest';
import { verifyYoutubeAccess } from '../../src/core/youtube.js';
import type { PipelineConfig } from '../../src/types.js';

// Unmock child_process explicitly to ensure real yt-dlp runs
vi.unmock('node:child_process');

describe('E2E YouTube Download', () => {
  it('should successfully verify YouTube access using real yt-dlp', async () => {
    // Only run if GITHUB_ACTIONS or RUN_E2E is set
    const shouldRun = process.env.GITHUB_ACTIONS === 'true' || process.env.RUN_E2E === 'true';
    if (!shouldRun) {
      console.log('Skipping E2E test. Set RUN_E2E=true to run locally.');
      return;
    }

    const config = {
      tempDir: '/tmp'
    } as PipelineConfig;

    // Use a known good video for testing, e.g. dQw4w9WgXcQ (Rick Astley)
    // verifyYoutubeAccess hardcodes big buck bunny though...
    // Let's call the function. It should not throw.
    await expect(verifyYoutubeAccess(config)).resolves.toBeUndefined();
  }, 60000); // Give it up to 60s
});
