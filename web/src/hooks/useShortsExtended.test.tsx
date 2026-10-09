import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useShorts } from './useShorts';
import * as api from '../api';

vi.mock('../api');

describe('useShorts extended', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('fails silently on fetch errors', async () => {
    vi.mocked(api.getShorts).mockRejectedValue(new Error('fail'));
    const { result } = renderHook(() => useShorts());
    await act(async () => { await Promise.resolve(); });
    expect(result.current.shorts).toHaveLength(0);
  });

  it('clears interval on unmount', async () => {
    vi.mocked(api.startGeneration).mockResolvedValue({ jobId: 'j1' });
    vi.mocked(api.getJobStatus).mockResolvedValue({ jobId: 'j1', status: 'processing' });
    const { result, unmount } = renderHook(() => useShorts());
    await act(async () => { await result.current.generate(['x']); });
    unmount();
  });
});
