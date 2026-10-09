import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAdminConsole } from './useAdminConsole';
import * as api from '../api';
import type { AdminChannelBundle } from '../types';

vi.mock('../api');

describe('useAdminConsole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('initializes with empty token and loads nothing', () => {
    const { result } = renderHook(() => useAdminConsole());
    expect(result.current.adminToken).toBe('');
    expect(result.current.channels).toEqual([]);
    expect(result.current.runs).toEqual([]);
  });

  it('fetches channels and runs when token is set', async () => {
    vi.mocked(api.listChannels).mockResolvedValue([{ channel: { id: 'c1' } } as AdminChannelBundle]);
    vi.mocked(api.listRuns).mockResolvedValue([{ id: 'r1' } as any]);

    const { result } = renderHook(() => useAdminConsole());

    act(() => {
      result.current.setAdminToken('tok');
    });

    await act(async () => {
      await Promise.resolve(); // allow transition
    });

    expect(result.current.channels).toHaveLength(1);
    expect(result.current.runs).toHaveLength(1);
    expect(window.localStorage.getItem('shorts-generator-admin-token')).toBe('tok');
  });

  it('handles mutations correctly', async () => {
    vi.mocked(api.listChannels).mockResolvedValue([]);
    vi.mocked(api.listRuns).mockResolvedValue([]);
    vi.mocked(api.saveChannel).mockResolvedValue();
    vi.mocked(api.deleteChannel).mockResolvedValue();
    vi.mocked(api.testChannel).mockResolvedValue();
    vi.mocked(api.startManagedRun).mockResolvedValue({ runId: 'rx', status: 'x' });

    const { result } = renderHook(() => useAdminConsole());
    act(() => { result.current.setAdminToken('tok'); });

    await act(async () => {
      await result.current.save({ channel: { id: 'c1' } } as AdminChannelBundle);
      await result.current.remove('c1');
      await result.current.test('c1');
      await result.current.run('c1');
      await result.current.refreshNow();
    });

    expect(api.saveChannel).toHaveBeenCalled();
    expect(api.deleteChannel).toHaveBeenCalled();
    expect(api.testChannel).toHaveBeenCalled();
    expect(api.startManagedRun).toHaveBeenCalled();
  });

  it('handles mutation errors', async () => {
    vi.mocked(api.saveChannel).mockRejectedValue(new Error('save failed'));

    const { result } = renderHook(() => useAdminConsole());
    act(() => { result.current.setAdminToken('tok'); });

    await act(async () => {
      await result.current.save({ channel: { id: 'c1' } } as AdminChannelBundle);
    });

    expect(result.current.error).toBe('save failed');
  });

  it('handles refresh errors', async () => {
    vi.mocked(api.listChannels).mockRejectedValue(new Error('refresh failed'));

    const { result } = renderHook(() => useAdminConsole());

    await act(async () => {
      result.current.setAdminToken('tok');
      await Promise.resolve();
    });

    expect(result.current.error).toBe('refresh failed');
  });
});
