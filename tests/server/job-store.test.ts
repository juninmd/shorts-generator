import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  jobs,
  createJob,
  getJob,
  updateJobProgress,
  completeJob,
  failJob,
  listJobs,
  getAllShorts,
  deleteJob,
  cleanupOldJobs,
} from "../../src/server/job-store.js";
import type { PipelineResult } from "../../src/types.js";

vi.mock("../../src/core/control-plane-db.js", () => ({
  getOptionalPool: vi.fn(() => null),
  queryRows: vi.fn().mockResolvedValue([]),
}));

describe("Job Store", () => {
  beforeEach(() => {
    jobs.clear();
  });

  it("should create a new job and retrieve it", () => {
    createJob("job1");
    const job = getJob("job1");

    expect(job).toBeDefined();
    expect(job?.status).toBe("processing");
    expect(job?.results).toEqual([]);
    expect(job?.progress).toBeNull();
    expect(typeof job?.createdAt).toBe("string");
  });

  it("should return undefined for a non-existent job", () => {
    expect(getJob("unknown")).toBeUndefined();
  });

  it("should update job progress", () => {
    createJob("job1");
    const progress = {
      stage: "downloading" as const,
      videoId: "vid1",
      videoTitle: "Test Video",
      progress: 50,
    };
    updateJobProgress("job1", progress);

    const job = getJob("job1");
    expect(job?.progress).toEqual(progress);
  });

  it("should safely ignore updating progress for non-existent job", () => {
    expect(() => updateJobProgress("unknown", {
      stage: "downloading",
      videoId: "vid",
      videoTitle: "Title",
      progress: 0,
    })).not.toThrow();
  });

  it("should complete a job with results", () => {
    createJob("job1");
    const results: PipelineResult[] = [
      {
        videoId: "vid1",
        shorts: [],
      },
    ];

    completeJob("job1", results);

    const job = getJob("job1");
    expect(job?.status).toBe("completed");
    expect(job?.results).toEqual(results);
  });

  it("should safely ignore completing a non-existent job", () => {
    expect(() => completeJob("unknown", [])).not.toThrow();
  });

  it("should fail a job with an Error instance", () => {
    createJob("job1");
    const error = new Error("Something went wrong");

    failJob("job1", error);

    const job = getJob("job1");
    expect(job?.status).toBe("failed");
    expect(job?.progress).toEqual({
      stage: "error",
      videoId: "",
      videoTitle: "",
      message: "Something went wrong",
      progress: 0,
    });
  });

  it("should fail a job with a string or unknown error", () => {
    createJob("job1");
    failJob("job1", "Unknown string error");

    const job = getJob("job1");
    expect(job?.status).toBe("failed");
    expect(job?.progress?.message).toBe("Unknown string error");
  });

  it("should safely ignore failing a non-existent job", () => {
    expect(() => failJob("unknown", new Error())).not.toThrow();
  });

  it("should list jobs", () => {
    createJob("job1");
    createJob("job2");

    const results: PipelineResult[] = [
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
    ];
    completeJob("job2", results);

    const list = listJobs();
    expect(list.length).toBe(2);

    const j1 = list.find((j) => j.jobId === "job1");
    expect(j1?.status).toBe("processing");
    expect(j1?.shortsCount).toBe(0);

    const j2 = list.find((j) => j.jobId === "job2");
    expect(j2?.status).toBe("completed");
    expect(j2?.shortsCount).toBe(1);
  });

  it("should list all shorts from completed jobs only", () => {
    createJob("job1"); // processing
    createJob("job2"); // completed
    createJob("job3"); // failed

    const shortsData = {
      id: "short1",
      clip: { title: "Title", description: "Desc", viralScore: 100, duration: 10, startTime: 0, endTime: 10 },
      originalVideoUrl: "url",
      originalVideoTitle: "Orig Title",
      channelName: "Channel",
      status: "ready" as const,
      createdAt: "now",
    };

    completeJob("job2", [{ videoId: "vid2", shorts: [shortsData] }]);
    failJob("job3", "error");

    const shortsList = getAllShorts();
    expect(shortsList.length).toBe(1);

    const short = shortsList[0];
    expect(short.id).toBe("short1");
    expect(short.videoId).toBe("vid2");
    expect(short.title).toBe("Title");
    expect(short.downloadUrl).toBe("/api/shorts/vid2/short1");
  });

  it("deleteJob removes the job from the map", () => {
    createJob("job-del");
    expect(getJob("job-del")).toBeDefined();
    deleteJob("job-del");
    expect(getJob("job-del")).toBeUndefined();
  });

  describe("DB path (getOptionalPool returns pool)", () => {
    const mockDb = { query: vi.fn(async () => ({ rows: [] })) };

    beforeEach(async () => {
      const { getOptionalPool, queryRows } = await import("../../src/core/control-plane-db.js");
      vi.mocked(getOptionalPool).mockReturnValue(mockDb as any);
      vi.mocked(queryRows).mockResolvedValue([]);
      mockDb.query.mockResolvedValue({ rows: [] });
    });

    afterEach(async () => {
      const { getOptionalPool } = await import("../../src/core/control-plane-db.js");
      vi.mocked(getOptionalPool).mockReturnValue(null);
    });

    it("createJob with DB calls db.query", async () => {
      await createJob("db-job-1");
      expect(mockDb.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO pipeline_runs"), expect.any(Array));
    });

    it("getAllShorts with DB returns flatMap from queryRows", async () => {
      const { queryRows } = await import("../../src/core/control-plane-db.js");
      vi.mocked(queryRows).mockResolvedValue([{ results: [] }] as any);
      const result = await getAllShorts();
      expect(Array.isArray(result)).toBe(true);
    });

    it("getJob with DB returns mapped state when row exists", async () => {
      const { queryRows } = await import("../../src/core/control-plane-db.js");
      vi.mocked(queryRows).mockResolvedValue([{
        status: "completed", progress: null, results: [], created_at: "2024-01-01T00:00:00Z",
      }] as any);
      const job = await getJob("db-job-1");
      expect(job?.status).toBe("completed");
    });

    it("getJob with DB returns undefined when no row", async () => {
      const { queryRows } = await import("../../src/core/control-plane-db.js");
      vi.mocked(queryRows).mockResolvedValue([]);
      const job = await getJob("missing");
      expect(job).toBeUndefined();
    });

    it("listJobs with DB returns mapped rows", async () => {
      const { queryRows } = await import("../../src/core/control-plane-db.js");
      vi.mocked(queryRows).mockResolvedValue([{
        id: "r1", status: "processing", progress: null, results: [{ shorts: [{}] }], created_at: "2024-01-01T00:00:00Z",
      }] as any);
      const list = await listJobs();
      expect(Array.isArray(list)).toBe(true);
      expect(list[0].shortsCount).toBe(1); // Test line 105 sum
    });

    it("deleteJob with DB calls db.query", async () => {
      await deleteJob("db-job-1");
      expect(mockDb.query).toHaveBeenCalledWith(expect.stringContaining("DELETE"), expect.any(Array));
    });

    it("updateJobProgress with DB calls db.query", async () => {
       await updateJobProgress("db-job-1", {
            stage: "downloading",
            videoId: "vid",
            videoTitle: "Title",
            progress: 0,
        });
        expect(mockDb.query).toHaveBeenCalledWith(expect.stringContaining("UPDATE pipeline_runs SET progress"), expect.any(Array));
    });

    it("completeJob with DB calls db.query", async () => {
       await completeJob("db-job-1", []);
       expect(mockDb.query).toHaveBeenCalledWith(expect.stringContaining("UPDATE pipeline_runs SET status"), expect.any(Array));
    });

    it("failJob with DB calls db.query", async () => {
       await failJob("db-job-1", "Error");
       expect(mockDb.query).toHaveBeenCalledWith(expect.stringContaining("UPDATE pipeline_runs SET status = $2, progress = $3::jsonb, error_message = $4"), expect.any(Array));
    });

    it("cleanupOldJobs returns 0 when DB pool exists", async () => {
      expect(cleanupOldJobs()).toBe(0);
    });
  });

  describe("cleanupOldJobs", () => {
    it("removes jobs older than maxAgeMs", () => {
      const oldDate = new Date(Date.now() - 2 * 86_400_000).toISOString();
      jobs.set("old-job", { status: "completed", results: [], progress: null, createdAt: oldDate });
      createJob("new-job");

      const removed = cleanupOldJobs(86_400_000);
      expect(removed).toBe(1);
      expect(getJob("old-job")).toBeUndefined();
      expect(getJob("new-job")).toBeDefined();
    });

    it("returns 0 when no jobs are old enough", () => {
      createJob("fresh-job");
      expect(cleanupOldJobs(86_400_000)).toBe(0);
    });

    it("returns 0 when no jobs exist", () => {
      expect(cleanupOldJobs()).toBe(0);
    });
  });
});
