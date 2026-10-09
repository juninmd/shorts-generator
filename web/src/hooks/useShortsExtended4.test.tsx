import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useShorts } from './useShorts';
import * as api from '../api';

vi.mock('../api');

describe('useShorts extended 4', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('handles polling cancellation when no interval is set initially', async () => {
    vi.mocked(api.startGeneration).mockResolvedValue({ jobId: 'j1' });
    vi.mocked(api.getJobStatus).mockResolvedValue({ jobId: 'j1', status: 'completed' });
    const { result } = renderHook(() => useShorts());

    const originalSetInterval = global.setInterval;
    (global as any).setInterval = () => null;

    await act(async () => {
      await result.current.generate(['url']);
    });

    (global as any).setInterval = originalSetInterval;
  });
});
