import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useShorts } from './useShorts';
import * as api from '../api';

vi.mock('../api');

describe('useShorts extended 3', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('handles polling where message is undefined', async () => {
    vi.mocked(api.startGeneration).mockResolvedValue({ jobId: 'j1' });
    vi.mocked(api.getJobStatus).mockResolvedValue({ jobId: 'j1', status: 'failed', progress: undefined });
    const { result } = renderHook(() => useShorts());

    await act(async () => {
      await result.current.generate(['url']);
    });

    expect(result.current.error).toBe('Job failed');
  });

  it('clears interval appropriately', async () => {
    vi.mocked(api.startGeneration).mockResolvedValue({ jobId: 'j1' });
    vi.mocked(api.getJobStatus).mockResolvedValue({ jobId: 'j1', status: 'completed' });
    const { result, unmount } = renderHook(() => useShorts());

    await act(async () => {
      await result.current.generate(['url']);
    });

    unmount();
  });
});
