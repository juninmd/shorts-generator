import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useAnalysis, useCuts, useSchedule, errorMessage } from './useChannelTools';
import * as api from '../api';

vi.mock('../api', () => ({
  listCuts: vi.fn(),
  createCut: vi.fn(),
  deleteCut: vi.fn(),
  listSchedule: vi.fn(),
  createScheduleEntry: vi.fn(),
  deleteScheduleEntry: vi.fn(),
  getSourceAnalysis: vi.fn(),
}));

describe('errorMessage', () => {
  it('reads Error and other values', () => {
    expect(errorMessage(new Error('x'))).toBe('x');
    expect(errorMessage('y')).toBe('y');
  });
});

describe('useCuts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('stays empty without token or channel', async () => {
    const { result } = renderHook(() => useCuts('', ''));
    await waitFor(() => expect(result.current.cuts).toEqual([]));
    expect(api.listCuts).not.toHaveBeenCalled();
  });

  it('loads, adds and removes', async () => {
    vi.mocked(api.listCuts).mockResolvedValue([]);
    vi.mocked(api.createCut).mockResolvedValue({ id: 'n' });
    vi.mocked(api.deleteCut).mockResolvedValue(undefined);
    const { result } = renderHook(() => useCuts('t', 'ch'));
    await waitFor(() => expect(api.listCuts).toHaveBeenCalledWith('t', 'ch'));
    await act(async () => { await result.current.add({ sourceVideoId: 'v', title: 'x', startSec: 0, endSec: 5 }); });
    expect(api.createCut).toHaveBeenCalled();
    await act(async () => { await result.current.remove('c1'); });
    expect(api.deleteCut).toHaveBeenCalledWith('t', 'ch', 'c1');
  });

  it('records load errors', async () => {
    vi.mocked(api.listCuts).mockRejectedValueOnce('boom');
    const { result } = renderHook(() => useCuts('t', 'ch'));
    await waitFor(() => expect(result.current.error).toBe('boom'));
  });
});

describe('channel switch', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps the cuts of the channel now selected when the old response lands last', async () => {
    let resolveA: (v: unknown) => void = () => {};
    vi.mocked(api.listCuts)
      .mockReturnValueOnce(new Promise((r) => { resolveA = r; }) as never)
      .mockResolvedValueOnce([{ id: 'b1' }] as never);
    const { result, rerender } = renderHook(({ ch }) => useCuts('t', ch), { initialProps: { ch: 'a' } });
    rerender({ ch: 'b' });
    await waitFor(() => expect(result.current.cuts).toEqual([{ id: 'b1' }]));
    await act(async () => { resolveA([{ id: 'a1' }]); });
    expect(result.current.cuts).toEqual([{ id: 'b1' }]);
  });

  it('does not show the previous channel schedule while the new one loads', async () => {
    vi.mocked(api.listSchedule)
      .mockResolvedValueOnce([{ id: 'a1' }] as never)
      .mockReturnValueOnce(new Promise(() => {}) as never);
    const { result, rerender } = renderHook(({ ch }) => useSchedule('t', ch), { initialProps: { ch: 'a' } });
    await waitFor(() => expect(result.current.entries).toEqual([{ id: 'a1' }]));
    rerender({ ch: 'b' });
    await waitFor(() => expect(result.current.entries).toEqual([]));
  });

  it('ignores a late error from the previous channel', async () => {
    let rejectA: (e: unknown) => void = () => {};
    vi.mocked(api.listSchedule)
      .mockReturnValueOnce(new Promise((_, r) => { rejectA = r; }) as never)
      .mockResolvedValueOnce([] as never);
    const { result, rerender } = renderHook(({ ch }) => useSchedule('t', ch), { initialProps: { ch: 'a' } });
    rerender({ ch: 'b' });
    await waitFor(() => expect(api.listSchedule).toHaveBeenCalledWith('t', 'b'));
    await act(async () => { rejectA(new Error('late')); });
    expect(result.current.error).toBeNull();
  });
});

describe('useSchedule', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads, adds, removes and records errors', async () => {
    vi.mocked(api.listSchedule).mockRejectedValueOnce(new Error('off'));
    const { result } = renderHook(() => useSchedule('t', 'ch'));
    await waitFor(() => expect(result.current.error).toBe('off'));
    vi.mocked(api.listSchedule).mockResolvedValue([]);
    vi.mocked(api.createScheduleEntry).mockResolvedValue({ id: 'n' });
    vi.mocked(api.deleteScheduleEntry).mockResolvedValue(undefined);
    await act(async () => { await result.current.add({ runAt: 'x', kind: 'programmed' }); });
    await act(async () => { await result.current.remove('e1'); });
    expect(api.createScheduleEntry).toHaveBeenCalled();
    expect(api.deleteScheduleEntry).toHaveBeenCalledWith('t', 'ch', 'e1');
  });

  it('stays empty without token or channel', async () => {
    const { result } = renderHook(() => useSchedule('', ''));
    await waitFor(() => expect(result.current.entries).toEqual([]));
  });
});

describe('useAnalysis', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does nothing without all identifiers', () => {
    const { result } = renderHook(() => useAnalysis('t', 'ch', ''));
    expect(result.current.analysis).toBeNull();
    expect(api.getSourceAnalysis).not.toHaveBeenCalled();
  });

  it('loads the analysis and reports errors', async () => {
    vi.mocked(api.getSourceAnalysis).mockResolvedValueOnce({ durationSec: 1 } as never);
    const ok = renderHook(() => useAnalysis('t', 'ch', 'v'));
    await waitFor(() => expect(ok.result.current.analysis).toEqual({ durationSec: 1 }));
    vi.mocked(api.getSourceAnalysis).mockRejectedValueOnce(new Error('404'));
    const bad = renderHook(() => useAnalysis('t', 'ch', 'v2'));
    await waitFor(() => expect(bad.result.current.error).toBe('404'));
  });

  it('ignores a response that arrives after unmount', async () => {
    let resolve: (v: unknown) => void = () => {};
    vi.mocked(api.getSourceAnalysis).mockReturnValueOnce(new Promise((r) => { resolve = r; }) as never);
    const { result, unmount } = renderHook(() => useAnalysis('t', 'ch', 'v'));
    unmount();
    await act(async () => { resolve({ durationSec: 9 }); });
    expect(result.current.analysis).toBeNull();
  });

  it('ignores an error that arrives after unmount', async () => {
    let reject: (e: unknown) => void = () => {};
    vi.mocked(api.getSourceAnalysis).mockReturnValueOnce(new Promise((_, r) => { reject = r; }) as never);
    const { result, unmount } = renderHook(() => useAnalysis('t', 'ch', 'v'));
    unmount();
    await act(async () => { reject(new Error('late')); });
    expect(result.current.error).toBeNull();
  });
});
