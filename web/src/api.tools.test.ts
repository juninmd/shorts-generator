import { describe, expect, it, vi, afterEach } from 'vitest';
import * as api from './api';

describe('api: cortes, agenda e análise', () => {
  afterEach(() => vi.unstubAllGlobals());

  const stub = (body: unknown = {}, status = 200) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(status === 204 ? null : JSON.stringify(body), { status }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  it('lists, creates and deletes cuts with the bearer token', async () => {
    const f = stub([{ id: 'c1' }]);
    expect(await api.listCuts('tok', 'ch')).toEqual([{ id: 'c1' }]);
    expect(f.mock.calls[0][0]).toBe('/api/admin/channels/ch/cuts');
    expect(f.mock.calls[0][1].headers.Authorization).toBe('Bearer tok');

    stub({ id: 'new' }, 201);
    expect(await api.createCut('tok', 'ch', { sourceVideoId: 'v', title: 't', startSec: 0, endSec: 9 })).toEqual({ id: 'new' });

    const d = stub(null, 204);
    await api.deleteCut('tok', 'ch', 'c1');
    expect(d.mock.calls[0][0]).toBe('/api/admin/channels/ch/cuts/c1');
    expect(d.mock.calls[0][1].method).toBe('DELETE');
  });

  it('lists, creates and deletes schedule entries', async () => {
    stub([]);
    expect(await api.listSchedule('tok', 'ch')).toEqual([]);

    const c = stub({ id: 'e' }, 201);
    expect(await api.createScheduleEntry('tok', 'ch', { runAt: 'x', kind: 'programmed' })).toEqual({ id: 'e' });
    expect(c.mock.calls[0][1].method).toBe('POST');

    const d = stub(null, 204);
    await api.deleteScheduleEntry('tok', 'ch', 'e');
    expect(d.mock.calls[0][0]).toBe('/api/admin/channels/ch/schedule/e');
  });

  it('reads the stored analysis of a source video', async () => {
    const f = stub({ sourceVideoId: 'v' });
    expect(await api.getSourceAnalysis('tok', 'ch', 'v')).toEqual({ sourceVideoId: 'v' });
    expect(f.mock.calls[0][0]).toBe('/api/admin/channels/ch/analysis/v');
  });
});
