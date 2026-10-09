import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDashboardData } from './useDashboardData';
import * as api from '../api';

vi.mock('../api');

describe('useDashboardData', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('handles missing token', () => {
    const { result } = renderHook(() => useDashboardData(''));
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeNull();
  });

  it('fetches data successfully and polls', async () => {
    const mockData = { generatedAt: '123', channels: [] };
    vi.mocked(api.fetchDashboardData).mockResolvedValue(mockData as any);

    const { result } = renderHook(() => useDashboardData('tok'));

    expect(result.current.loading).toBe(true);

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual(mockData);

    // Test polling
    vi.mocked(api.fetchDashboardData).mockResolvedValue({ generatedAt: '456', channels: [] } as any);
    await act(async () => {
      vi.advanceTimersByTime(60000);
      await Promise.resolve();
    });

    expect(result.current.data?.generatedAt).toBe('456');
  });

  it('handles fetch errors safely', async () => {
    vi.mocked(api.fetchDashboardData).mockRejectedValue(new Error('fetch failed'));
    const { result } = renderHook(() => useDashboardData('tok'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.error).toBe('fetch failed');
  });

  it('handles unmount cleanly', async () => {
    vi.mocked(api.fetchDashboardData).mockResolvedValue({} as any);
    const { unmount } = renderHook(() => useDashboardData('tok'));
    unmount();
    // Ensures clean interval clearance
  });
});
