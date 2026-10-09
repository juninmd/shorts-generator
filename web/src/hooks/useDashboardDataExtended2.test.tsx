import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDashboardData } from './useDashboardData';
import * as api from '../api';

vi.mock('../api');

describe('useDashboardData extended 2', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('handles fetch errors safely with regular error', async () => {
    vi.mocked(api.fetchDashboardData).mockRejectedValue(new Error('err'));
    const { result } = renderHook(() => useDashboardData('tok'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.error).toBe('err');
  });
});
