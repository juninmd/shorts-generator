import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAdminConsole } from './useAdminConsole';
import * as api from '../api';

vi.mock('../api');

describe('useAdminConsole extended', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles mutate action failure with string throw', async () => {
    vi.mocked(api.deleteChannel).mockRejectedValue('string error');

    const { result } = renderHook(() => useAdminConsole());
    act(() => { result.current.setAdminToken('tok'); });

    await act(async () => {
      await result.current.remove('c1');
    });

    expect(result.current.error).toBe('string error');
  });

  it('handles refresh failure with string throw', async () => {
    vi.mocked(api.listChannels).mockRejectedValue('string error');

    const { result } = renderHook(() => useAdminConsole());

    await act(async () => {
      result.current.setAdminToken('tok');
      await Promise.resolve();
    });

    expect(result.current.error).toBe('string error');
  });
});
