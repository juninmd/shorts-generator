import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import * as api from './api';

describe('api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('startGeneration throws error', async () => {
    await expect(api.startGeneration(['url'])).rejects.toThrow('Legacy generation');
  });

  it('getJobStatus throws error', async () => {
    await expect(api.getJobStatus('job')).rejects.toThrow('Legacy generation');
  });

  it('getShorts returns empty array', async () => {
    await expect(api.getShorts()).resolves.toEqual([]);
  });

  it('getDownloadUrl returns correct format', () => {
    expect(api.getDownloadUrl('vid', 'clip')).toBe('/api/shorts/vid/clip');
  });

  it('fetchDashboardData throws correctly on fail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 500, text: async () => 'Server error'
    }));
    await expect(api.fetchDashboardData('tok')).rejects.toThrow('Server error');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 500, text: async () => ''
    }));
    await expect(api.fetchDashboardData('tok')).rejects.toThrow('Request failed: 500');
  });

  it('listChannels works', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => [{id: 'c1'}]
    }));
    await expect(api.listChannels('tok')).resolves.toEqual([{id: 'c1'}]);
  });

  it('saveChannel works', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 204
    }));
    await expect(api.saveChannel('tok', 'c1', { channel: { id: 'c1', name: 'n1' } } as any)).resolves.toBeUndefined();
  });

  it('deleteChannel works', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 204
    }));
    await expect(api.deleteChannel('tok', 'c1')).resolves.toBeUndefined();
  });

  it('testChannel works', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 204
    }));
    await expect(api.testChannel('tok', 'c1')).resolves.toBeUndefined();
  });

  it('startManagedRun works', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ runId: 'r1' })
    }));
    await expect(api.startManagedRun('tok', 'c1')).resolves.toEqual({ runId: 'r1' });
  });

  it('listRuns works with and without channelId', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => []
    }));
    await expect(api.listRuns('tok', 'c1')).resolves.toEqual([]);
    await expect(api.listRuns('tok')).resolves.toEqual([]);
  });

  it('request helper throws correctly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 400, text: async () => 'Bad request'
    }));
    await expect(api.listChannels('tok')).rejects.toThrow('Bad request');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 400, text: async () => ''
    }));
    await expect(api.listChannels('tok')).rejects.toThrow('Request failed: 400');
  });
});
