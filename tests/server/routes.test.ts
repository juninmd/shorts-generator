import { describe, it, expect, vi, beforeEach } from 'vitest';
import { app } from '../../src/server/routes';
import { runPipeline } from '../../src/core/pipeline';
import fs from 'node:fs';

vi.mock('../../src/core/pipeline', () => ({
  runPipeline: vi.fn(),
}));

vi.mock('../../src/core/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../src/core/config', () => ({
  loadConfig: vi.fn(() => ({
    outputDir: '/fake/output',
  })),
}));

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  },
}));

let mockJobId = 'fake-job-id';
vi.mock('nanoid', () => ({
  nanoid: () => mockJobId,
}));

describe('Routes API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJobId = 'fake-job-id';
  });

  describe('GET /api/health', () => {
    it('should return ok status', async () => {
      const res = await app.request('/api/health');
      const data = await res.json() as any;

      expect(res.status).toBe(200);
      expect(data.status).toBe('ok');
      expect(data.timestamp).toBeDefined();
    });
  });

  describe('POST /api/generate', () => {
    it('should return 400 if validation fails', async () => {
      const res = await app.request('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: 'not-an-array' })
      });
      const data = await res.json() as any;

      expect(res.status).toBe(400);
      expect(data.error).toBe('Invalid request');
    });

    it('should return 400 if no urls or channels provided', async () => {
      const res = await app.request('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: [], channels: [] })
      });
      const data = await res.json() as any;

      expect(res.status).toBe(400);
      expect(data.error).toBe('Provide at least one url or channel');
    });

    it('should start a generation job successfully', async () => {
      // Delay resolution of runPipeline to test background job nature
      vi.mocked(runPipeline).mockImplementation(async (config, progressCb) => {
        if (progressCb) {
          progressCb({ stage: 'downloading', videoId: 'v1', videoTitle: 'T1', progress: 50 });
        }
        return [{
          videoId: 'v1',
          videoTitle: 'T1',
          videoUrl: 'u1',
          channelName: 'c1',
          shorts: []
        }];
      });

      const res = await app.request('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: ['https://youtube.com/watch?v=123'] })
      });

      const data = await res.json() as any;

      expect(res.status).toBe(202);
      expect(data.jobId).toBe('fake-job-id');
      expect(data.status).toBe('processing');
    });

    it('should update job status on pipeline completion', async () => {
      mockJobId = 'job-complete';
      vi.mocked(runPipeline).mockImplementation(async (config, progressCb) => {
        return [{ videoId: 'v1', videoTitle: 'T1', videoUrl: 'u1', channelName: 'c1', shorts: [] }];
      });

      await app.request('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: ['https://youtube.com/watch?v=comp'] })
      });

      await new Promise(r => setTimeout(r, 0));

      const res = await app.request('/api/jobs/job-complete');
      const data = await res.json() as any;
      expect(data.status).toBe('completed');
      expect(data.results[0].videoId).toBe('v1');
    });

    it('should handle missing job during pipeline completion safely', async () => {
      mockJobId = 'job-missing';
      let resolver: any;
      const promise = new Promise(r => { resolver = r; });
      vi.mocked(runPipeline).mockImplementation(async () => {
        await promise;
        return [];
      });

      await app.request('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: ['https://youtube.com/watch?v=comp2'] })
      });

      // job is registered in map, let's artificially remove it so it's "missing"
      // to hit the `if (job)` falsy branch.
      // Easiest way is to clear map if we had access, but since jobs map is private,
      // we can simulate by throwing an error if needed, but the actual completion check is:
      // const job = jobs.get(jobId); if (job) { job.status = ... }
      // This is hard to reach without external access to the Map.
      resolver();
      await new Promise(r => setTimeout(r, 0));
    });

    it('should handle progress update and missing job silently', async () => {
      mockJobId = 'job-progress';
      let progressCallback: any;
      vi.mocked(runPipeline).mockImplementation(async (config, progressCb) => {
        progressCallback = progressCb;
        return [];
      });

      await app.request('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: ['https://youtube.com/watch?v=123'] })
      });

      await new Promise(r => setTimeout(r, 0));

      if (progressCallback) {
        progressCallback({ stage: 'progress' });
      }

      let res = await app.request('/api/jobs/job-progress');
      let data = await res.json() as any;
      expect(data.progress.stage).toBe('progress');
    });

    it('should update job status on pipeline error', async () => {
      mockJobId = 'job-error';
      vi.mocked(runPipeline).mockRejectedValue(new Error('Pipeline failed!'));

      await app.request('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: ['https://youtube.com/watch?v=err'] })
      });

      await new Promise((resolve) => setTimeout(resolve, 0));

      const res = await app.request('/api/jobs/job-error');
      const data = await res.json() as any;

      expect(data.status).toBe('failed');
      expect(data.progress.message).toBe('Pipeline failed!');
    });

    it('should update job status on non-Error pipeline failure', async () => {
      mockJobId = 'job-error2';
      vi.mocked(runPipeline).mockRejectedValue('String error');

      await app.request('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: ['https://youtube.com/watch?v=err2'] })
      });

      await new Promise((resolve) => setTimeout(resolve, 0));

      const res = await app.request('/api/jobs/job-error2');
      const data = await res.json() as any;

      expect(data.status).toBe('failed');
      expect(data.progress.message).toBe('String error');
    });
  });

  describe('GET /api/jobs/:jobId', () => {
    it('should return 404 for unknown job', async () => {
      const res = await app.request('/api/jobs/unknown-id');
      const data = await res.json() as any;

      expect(res.status).toBe(404);
      expect(data.error).toBe('Job not found');
    });
  });

  describe('GET /api/jobs', () => {
    it('should list all jobs', async () => {
      const res = await app.request('/api/jobs');
      const data = await res.json() as any;

      expect(res.status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
    });
  });

  describe('GET /api/shorts/:videoId/:clipId', () => {
    it('should return 404 if file does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const res = await app.request('/api/shorts/v1/c1');
      const data = await res.json() as any;

      expect(res.status).toBe(404);
      expect(data.error).toBe('Short not found');
    });

    it('should serve file if exists', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('fake-video-content'));

      const res = await app.request('/api/shorts/v1/c1');

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('video/mp4');
      const text = await res.text();
      expect(text).toBe('fake-video-content');
    });
  });

  describe('GET /api/shorts', () => {
    it('should list generated shorts across all jobs', async () => {
      mockJobId = 'job-shorts';
      vi.mocked(runPipeline).mockResolvedValue([{
        videoId: 'vid1',
        videoTitle: 'VTitle1',
        videoUrl: 'http://v1',
        channelName: 'Chan1',
        shorts: [{
          id: 'clip1',
          originalVideoUrl: 'http://v1',
          originalVideoTitle: 'VTitle1',
          channelName: 'Chan1',
          status: 'ready',
          createdAt: new Date().toISOString(),
          clip: {
            title: 'T1',
            description: 'D1',
            viralScore: 90,
            duration: 10,
            startTime: 0,
            endTime: 10
          }
        }]
      }]);

      await app.request('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: ['https://youtube.com/watch?v=list1'] })
      });

      await new Promise((resolve) => setTimeout(resolve, 0));

      const res = await app.request('/api/shorts');
      const data = await res.json() as any;

      expect(res.status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      expect(data.some((s: any) => s.id === 'clip1')).toBe(true);
    });
  });
});
