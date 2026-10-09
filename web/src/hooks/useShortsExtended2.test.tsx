import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useShorts } from './useShorts';
import * as api from '../api';

vi.mock('../api');

describe('useShorts extended 2', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('handles startGeneration error with string throw', async () => {
    vi.mocked(api.startGeneration).mockRejectedValue('string error');
    const { result } = renderHook(() => useShorts());

    await act(async () => {
      await result.current.generate(['url']);
    });

    expect(result.current.error).toBe('Failed to start generation');
  });

  it('handles getJobStatus error with string throw', async () => {
    vi.mocked(api.startGeneration).mockResolvedValue({ jobId: 'j1' });
    vi.mocked(api.getJobStatus).mockRejectedValue('string error');
    const { result } = renderHook(() => useShorts());

    await act(async () => {
      await result.current.generate(['url']);
    });

    expect(result.current.error).toBe('Polling error');
  });
});
