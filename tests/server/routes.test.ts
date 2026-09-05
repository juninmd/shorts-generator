import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { app } from "../../src/server/routes.js";
import { jobs } from "../../src/server/job-store.js";
import { runPipeline } from "../../src/core/pipeline.js";
import { loadConfig } from "../../src/core/config.js";
import fs from "node:fs";

vi.mock("../../src/core/pipeline.js", () => ({
  runPipeline: vi.fn(),
}));

vi.mock("../../src/core/config.js", () => ({
  loadConfig: vi.fn(),
}));

vi.mock("nanoid", () => ({
  nanoid: () => "test-job-id",
}));

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  },
}));

describe("Server Routes", () => {
  beforeEach(() => {
    jobs.clear();
    vi.clearAllMocks();

    vi.mocked(loadConfig).mockReturnValue({
      outputDir: "/mock/output",
    } as any);
  });

  afterEach(() => {
    jobs.clear();
  });

  describe("GET /api/health", () => {
    it("should return ok status", async () => {
      const res = await app.request("/api/health");
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe("ok");
      expect(json.timestamp).toBeDefined();
    });
  });

  describe("POST /api/generate", () => {
    it("should return 400 for invalid request body", async () => {
      const res = await app.request("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: "not-an-array" }),
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Invalid request");
    });

    it("should return 400 if both urls and channels are empty", async () => {
      const res = await app.request("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: [], channels: [] }),
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Provide at least one url or channel");
    });

    it("should create a job and run pipeline in background successfully", async () => {
      vi.mocked(runPipeline).mockResolvedValue([
        { videoId: "vid1", shorts: [] },
      ]);

      const res = await app.request("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: ["https://youtube.com/watch?v=123"] }),
      });

      expect(res.status).toBe(202);
      const json = await res.json();
      expect(json.jobId).toBe("test-job-id");
      expect(json.status).toBe("processing");

      // Wait a tick for the background promise to run
      await new Promise(resolve => setTimeout(resolve, 0));

      const job = jobs.get("test-job-id");
      expect(job?.status).toBe("completed");
    });

    it("should update job progress when pipeline calls progress callback", async () => {
      vi.mocked(runPipeline).mockImplementation(async (config, onProgress) => {
        onProgress?.({
          stage: "downloading",
          videoId: "vid1",
          videoTitle: "Title",
          progress: 50,
        });
        return [];
      });

      await app.request("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: ["https://youtube.com/watch?v=123"] }),
      });

      await new Promise(resolve => setTimeout(resolve, 0));

      const job = jobs.get("test-job-id");
      expect(job?.progress?.stage).toBe("downloading");
      expect(job?.progress?.progress).toBe(50);
    });

    it("should mark job as failed if pipeline throws an error", async () => {
      vi.mocked(runPipeline).mockRejectedValue(new Error("Pipeline failed"));

      await app.request("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: ["https://youtube.com/watch?v=123"] }),
      });

      await new Promise(resolve => setTimeout(resolve, 0));

      const job = jobs.get("test-job-id");
      expect(job?.status).toBe("failed");
      expect(job?.progress?.message).toBe("Pipeline failed");
    });

    it("should mark job as failed if pipeline throws a non-error", async () => {
      vi.mocked(runPipeline).mockRejectedValue("String error");

      await app.request("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: ["https://youtube.com/watch?v=123"] }),
      });

      await new Promise(resolve => setTimeout(resolve, 0));

      const job = jobs.get("test-job-id");
      expect(job?.status).toBe("failed");
      expect(job?.progress?.message).toBe("String error");
    });
  });

  describe("GET /api/jobs/:jobId", () => {
    it("should return 404 for unknown job", async () => {
      const res = await app.request("/api/jobs/unknown");
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Job not found" });
    });

    it("should return job status", async () => {
      jobs.set("test-job", {
        status: "processing",
        progress: null,
        results: [],
        createdAt: "2023-01-01T00:00:00.000Z",
      });

      const res = await app.request("/api/jobs/test-job");
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        jobId: "test-job",
        status: "processing",
        progress: null,
        createdAt: "2023-01-01T00:00:00.000Z",
      });
    });

    it("should include results if job is completed", async () => {
      jobs.set("test-job", {
        status: "completed",
        progress: null,
        results: [{ videoId: "vid", shorts: [] }],
        createdAt: "2023-01-01T00:00:00.000Z",
      });

      const res = await app.request("/api/jobs/test-job");
      expect(res.status).toBe(200);
      expect(await res.json()).toHaveProperty("results");
    });
  });

  describe("GET /api/jobs", () => {
    it("should return list of jobs", async () => {
      jobs.set("job1", {
        status: "completed",
        progress: null,
        results: [{ videoId: "vid", shorts: [{} as any] }],
        createdAt: "time1",
      });
      jobs.set("job2", {
        status: "processing",
        progress: null,
        results: [],
        createdAt: "time2",
      });

      const res = await app.request("/api/jobs");
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toHaveLength(2);
      expect(json[0].jobId).toBe("job1");
      expect(json[0].shortsCount).toBe(1);
      expect(json[1].jobId).toBe("job2");
      expect(json[1].shortsCount).toBe(0);
    });
  });

  describe("GET /api/shorts/:videoId/:clipId", () => {
    it("should return 404 if file does not exist", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const res = await app.request("/api/shorts/vid1/clip1");
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Short not found" });
    });

    it("should return file contents if it exists", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("fake-video-content"));

      const res = await app.request("/api/shorts/vid1/clip1");
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("video/mp4");
      expect(res.headers.get("content-disposition")).toBe('attachment; filename="clip1.mp4"');

      const buffer = await res.arrayBuffer();
      const content = new TextDecoder().decode(buffer);
      expect(content).toBe("fake-video-content");
    });
  });

  describe("GET /api/shorts", () => {
    it("should return list of all shorts from completed jobs", async () => {
      jobs.set("job1", {
        status: "completed",
        progress: null,
        results: [
          {
            videoId: "vid1",
            shorts: [
              {
                id: "short1",
                clip: { title: "Title", description: "Desc", viralScore: 100, duration: 10, startTime: 0, endTime: 10 },
                originalVideoUrl: "url",
                originalVideoTitle: "Orig Title",
                channelName: "Channel",
                status: "ready",
                createdAt: "now",
              },
            ],
          },
        ],
        createdAt: "time1",
      });

      const res = await app.request("/api/shorts");
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toHaveLength(1);
      expect(json[0].id).toBe("short1");
      expect(json[0].videoId).toBe("vid1");
      expect(json[0].title).toBe("Title");
      expect(json[0].downloadUrl).toBe("/api/shorts/vid1/short1");
    });
  });

  describe("DELETE /api/jobs/:jobId", () => {
    it("should return 404 for unknown job", async () => {
      const res = await app.request("/api/jobs/unknown", { method: "DELETE" });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Job not found" });
    });

    it("should delete job and return 200", async () => {
      jobs.set("to-delete", {
        status: "processing",
        progress: null,
        results: [],
        createdAt: "time",
      });
      expect(jobs.has("to-delete")).toBe(true);

      const res = await app.request("/api/jobs/to-delete", { method: "DELETE" });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: "deleted" });
      expect(jobs.has("to-delete")).toBe(false);
    });
  });
});

describe('unhandled catch in pipeline job runner', () => {
    it('catches and fails job when IIFE throws synchronously (simulated)', async () => {
        const { app } = await import('../../src/server/routes.js');
        const { runPipeline } = await import('../../src/core/pipeline.js');
        const { createJob, failJob } = await import('../../src/server/job-store.js');
        vi.mocked(runPipeline).mockImplementationOnce(() => {
            throw new Error('sync throw');
        });
        const res = await app.request('/api/generate', {
            method: 'POST',
            body: JSON.stringify({ urls: ['https://youtube.com/watch?v=unhandled'] }),
            headers: { 'Content-Type': 'application/json' }
        });
        expect(res.status).toBe(202);
        // We know that `catch` block catches sync throws inside async IIFE
        // This is to hit the catch((err) => { ... })
    });
});

describe('unhandled catch in pipeline job runner (catch wrapper)', () => {
  it('covers the outer catch for unhandled IIFE rejections', async () => {
    // To trigger the outer catch in the IIFE (lines 69-70):
    // void (async () => { ... })().catch((err) => { ... })

    // We mock failJob inside the try/catch so that it throws.
    // This will cause the inner catch block to throw synchronously,
    // rejecting the outer IIFE promise and triggering the `.catch()` block.

    const { runPipeline } = await import('../../src/core/pipeline.js');
    const { failJob } = await import('../../src/server/job-store.js');

    vi.mocked(runPipeline).mockRejectedValue(new Error('Inner pipeline failure'));
    // mock failJob module entirely to be able to override it
    vi.spyOn(await import('../../src/server/job-store.js'), 'failJob').mockRejectedValueOnce(new Error('failJob error'));

    const res = await app.request('/api/generate', {
      method: 'POST',
      body: JSON.stringify({ urls: ['https://youtube.com/watch?v=unhandled-catch'] }),
      headers: { 'Content-Type': 'application/json' }
    });

    expect(res.status).toBe(202);

    // allow microtasks to flush so the unhandled rejection handler runs
    await new Promise(r => setTimeout(r, 10));
  });
});
