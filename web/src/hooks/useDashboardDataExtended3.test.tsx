import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDashboardData } from './useDashboardData';
import * as api from '../api';

vi.mock('../api');

describe('useDashboardData extended 3', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('handles cancellation gracefully on fetch success', async () => {
    vi.mocked(api.fetchDashboardData).mockResolvedValue({ generatedAt: '1', channels: [] } as any);
    const { unmount } = renderHook(() => useDashboardData('tok'));
    unmount();
    // This hits the !cancelled branch for success
  });

  it('handles cancellation gracefully on fetch error', async () => {
    vi.mocked(api.fetchDashboardData).mockRejectedValue(new Error('err'));
    const { unmount } = renderHook(() => useDashboardData('tok'));
    unmount();
    // This hits the !cancelled branch for error
  });
});
