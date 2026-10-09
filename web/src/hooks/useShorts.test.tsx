import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useShorts } from './useShorts';
import * as api from '../api';

vi.mock('../api');

describe('useShorts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('initializes with fetched shorts', async () => {
    vi.mocked(api.getShorts).mockResolvedValue([{ id: '1', title: 's1' } as any]);
    const { result } = renderHook(() => useShorts());

    await act(async () => {
      await Promise.resolve(); // flush microtasks
    });

    expect(result.current.shorts).toHaveLength(1);
  });

  it('handles generation successfully', async () => {
    vi.mocked(api.getShorts).mockResolvedValue([]);
    vi.mocked(api.startGeneration).mockResolvedValue({ jobId: 'j1' });
    vi.mocked(api.getJobStatus)
      .mockResolvedValueOnce({ jobId: 'j1', status: 'processing' })
      .mockResolvedValueOnce({ jobId: 'j1', status: 'completed' });

    const { result } = renderHook(() => useShorts());

    await act(async () => {
      await result.current.generate(['http://yt.com']);
    });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.currentJob?.status).toBe('completed');
  });

  it('handles generation failure', async () => {
    vi.mocked(api.getShorts).mockResolvedValue([]);
    vi.mocked(api.startGeneration).mockResolvedValue({ jobId: 'j1' });
    vi.mocked(api.getJobStatus).mockResolvedValue({ jobId: 'j1', status: 'failed', progress: { message: 'err' } as any });

    const { result } = renderHook(() => useShorts());

    await act(async () => {
      await result.current.generate(['url']);
    });

    expect(result.current.error).toBe('err');
  });

  it('handles generation start error', async () => {
    vi.mocked(api.startGeneration).mockRejectedValue(new Error('start err'));
    const { result } = renderHook(() => useShorts());

    await act(async () => {
      await result.current.generate(['url']);
    });

    expect(result.current.error).toBe('start err');
  });

  it('handles polling error', async () => {
    vi.mocked(api.startGeneration).mockResolvedValue({ jobId: 'j1' });
    vi.mocked(api.getJobStatus).mockRejectedValue(new Error('poll err'));
    const { result } = renderHook(() => useShorts());

    await act(async () => {
      await result.current.generate(['url']);
    });

    expect(result.current.error).toBe('poll err');
  });
});
