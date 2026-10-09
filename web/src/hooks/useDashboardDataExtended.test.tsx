import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDashboardData } from './useDashboardData';
import * as api from '../api';

vi.mock('../api');

describe('useDashboardData extended', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('handles fetch errors safely with string throw', async () => {
    vi.mocked(api.fetchDashboardData).mockRejectedValue('string error');
    const { result } = renderHook(() => useDashboardData('tok'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.error).toBe('string error');
  });
});
