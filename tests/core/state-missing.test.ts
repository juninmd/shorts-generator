import { describe, expect, it, vi } from 'vitest';
import { getPostedTopVideosAsync, markVideoAsPostedAsync, incrementDailyUploadCount, incrementDailyUploadCountAsync, setDailyLimitReachedAsync } from '../../src/core/state.js';
import fs from 'node:fs';
import { getOptionalPool } from '../../src/core/control-plane-db.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn(),
      readFileSync: vi.fn(),
      writeFileSync: vi.fn(),
    }
  };
});

vi.mock('../../src/core/control-plane-db.js', () => ({
  getOptionalPool: vi.fn(),
  queryRows: vi.fn(),
}));

describe('state.ts edge cases', () => {
  it('handles writeFileSync throwing in getPostedTopVideosAsync', async () => {
    vi.mocked(getOptionalPool).mockReturnValue(null);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('foo'); });
    await getPostedTopVideosAsync();
  });

  it('handles incrementDailyUploadCount exceptions', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('foo'); });
    incrementDailyUploadCount();
  });

  it('handles incrementDailyUploadCountAsync exceptions', async () => {
    vi.mocked(getOptionalPool).mockReturnValue(null);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('foo'); });
    await incrementDailyUploadCountAsync();
  });

  it('handles setDailyLimitReachedAsync exceptions', async () => {
    vi.mocked(getOptionalPool).mockReturnValue(null);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('foo'); });
    await setDailyLimitReachedAsync();
  });
});
