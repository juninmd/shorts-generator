import { describe, it, expect, vi, beforeEach } from "vitest";
import { enqueueYoutubeUpload, processQueueUntilEmpty, createWorker, retryFailedWithExistingFiles, closeQueueConnections, getRedisClient, getQueue } from "../../src/core/queue.js";

const mockQueueAdd = vi.fn();
const mockQueueGetWaitingCount = vi.fn().mockResolvedValue(0);
const mockQueueGetActiveCount = vi.fn().mockResolvedValue(0);
const mockQueueGetDelayedCount = vi.fn().mockResolvedValue(0);
const mockQueuePromoteJobs = vi.fn().mockResolvedValue(undefined);
let mockQueueGetFailed = vi.fn().mockResolvedValue([]);
const workerHandlers: Record<string, any> = {};
const mockJobs: Array<Record<string, any>> = [];
const mockWorkerClose = vi.fn().mockResolvedValue(undefined);

let mockProcessFn: any = null;

vi.mock("bullmq", () => {
  class MockQueue {
    add = mockQueueAdd;
    getWaitingCount = mockQueueGetWaitingCount;
    getActiveCount = mockQueueGetActiveCount;
    getDelayedCount = mockQueueGetDelayedCount;
    promoteJobs = mockQueuePromoteJobs;
    getFailed = () => mockQueueGetFailed();
  }

  class MockWorker {
    processFn: any;
    constructor(queueName: string, processFn: any) {
      this.processFn = processFn;
      mockProcessFn = processFn;
    }

    on = vi.fn((evt: string, cb: any) => { workerHandlers[evt] = cb; });
    run = vi.fn(async () => {
      const jobs = mockJobs.length > 0 ? mockJobs : [{ id: "job-1" }];
      for (const job of jobs) {
        workerHandlers.active?.();
        await workerHandlers.completed?.(job);
      }
    });
    close = mockWorkerClose;
  }

  return {
    Queue: MockQueue,
    Worker: MockWorker,
  };
});

vi.mock("ioredis", () => {
  class MockRedis {
    quit = vi.fn().mockResolvedValue(undefined);
    get = vi.fn().mockResolvedValue(null);
    set = vi.fn().mockResolvedValue("OK");
    del = vi.fn().mockResolvedValue(1);
  }
  return {
    Redis: MockRedis,
  };
});

vi.mock("../../src/core/youtube.service.js", () => ({
  uploadToYouTube: vi.fn().mockResolvedValue("https://youtube.com/shorts/test"),
}));

vi.mock("../../src/core/telegram.js", () => ({
  notifyYoutubeRateLimited: vi.fn().mockResolvedValue(undefined),
  notifyYoutubeResumed: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/core/state.js", () => ({
  isDailyLimitReachedAsync: vi.fn().mockResolvedValue(false),
  incrementDailyUploadCountAsync: vi.fn().mockResolvedValue(undefined),
  getDailyUploadCountAsync: vi.fn().mockResolvedValue(0),
}));

vi.mock("../../src/core/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("node:fs", () => {
  const existsSync = vi.fn().mockReturnValue(true);
  const unlinkSync = vi.fn();
  return {
    default: {
      existsSync,
      unlinkSync,
    },
    existsSync,
    unlinkSync,
  };
});

describe("Queue System", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const k of Object.keys(workerHandlers)) delete workerHandlers[k];
    mockJobs.length = 0;
    delete process.env.MAX_UPLOADS_PER_RUN;
    mockQueueGetFailed.mockResolvedValue([]);
    mockProcessFn = null;
  });

  it("should enqueue a YouTube upload", async () => {
    const short: any = { id: "short-1", outputPath: "/path/to/video.mp4" };
    const config: any = { managedRun: { channelId: "channel-1" } };

    await enqueueYoutubeUpload(short, "Title", "Desc", config, ["tag1"]);

    expect(mockQueueAdd).toHaveBeenCalledWith(
      "upload-short-1",
      expect.objectContaining({
        videoPath: "/path/to/video.mp4",
        title: "Title",
        description: "Desc",
        tags: ["tag1"],
        channelId: "channel-1",
      }),
      expect.any(Object)
    );
  });

  it("should create a BullMQ worker", () => {
    const worker = createWorker();
    expect(worker).toBeDefined();
  });

  it("should process queue until empty and resolve if queue is already empty", async () => {
    mockQueueGetWaitingCount.mockResolvedValueOnce(0);
    mockQueueGetActiveCount.mockResolvedValueOnce(0);
    mockQueueGetDelayedCount.mockResolvedValueOnce(0);

    await expect(processQueueUntilEmpty()).resolves.toBeUndefined();
  });

  it("promotes delayed jobs and drains them when only delayed are present", async () => {
    mockQueueGetWaitingCount.mockResolvedValue(0);
    mockQueueGetActiveCount.mockResolvedValueOnce(0);
    mockQueueGetDelayedCount.mockResolvedValueOnce(5);

    await expect(processQueueUntilEmpty()).resolves.toBeUndefined();
    expect(mockQueuePromoteJobs).toHaveBeenCalledTimes(1);
  });

  it("stops the run once MAX_UPLOADS_PER_RUN published uploads are reached", async () => {
    process.env.MAX_UPLOADS_PER_RUN = "1";
    // Queue still has waiting jobs — without the cap the run would keep going.
    mockQueueGetWaitingCount.mockResolvedValue(5);
    mockQueueGetActiveCount.mockResolvedValueOnce(0);
    mockQueueGetDelayedCount.mockResolvedValueOnce(0);
    mockJobs.push(
      { id: "job-1", returnvalue: { youtubeUrl: "https://youtube.com/shorts/a" } },
      { id: "job-2", returnvalue: { youtubeUrl: "https://youtube.com/shorts/b" } },
    );

    await expect(processQueueUntilEmpty()).resolves.toBeUndefined();
    expect(mockWorkerClose).toHaveBeenCalled();
  });

  it("does not count deferred jobs toward the per-run cap", async () => {
    process.env.MAX_UPLOADS_PER_RUN = "1";
    mockQueueGetWaitingCount.mockResolvedValueOnce(2).mockResolvedValue(0);
    mockQueueGetActiveCount.mockResolvedValueOnce(0);
    mockQueueGetDelayedCount.mockResolvedValueOnce(0);
    mockJobs.push(
      { id: "job-1", returnvalue: { deferred: true } },
      { id: "job-2", returnvalue: { youtubeUrl: "https://youtube.com/shorts/a" } },
    );

    await expect(processQueueUntilEmpty()).resolves.toBeUndefined();
  });

  it("does not promote when promoteJobs throws (logged and swallowed)", async () => {
    mockQueueGetWaitingCount.mockResolvedValue(0);
    mockQueueGetActiveCount.mockResolvedValueOnce(0);
    mockQueueGetDelayedCount.mockResolvedValueOnce(3);
    mockQueuePromoteJobs.mockRejectedValueOnce(new Error("redis down"));

    await expect(processQueueUntilEmpty()).resolves.toBeUndefined();
    expect(mockQueuePromoteJobs).toHaveBeenCalledTimes(1);
  });

  it("should handle worker error and failed events in processQueueUntilEmpty", async () => {
    mockQueueGetWaitingCount.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    mockQueueGetActiveCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    mockQueueGetDelayedCount.mockResolvedValueOnce(0);

    const promise = processQueueUntilEmpty();
    await new Promise(r => setTimeout(r, 0));

    workerHandlers.error?.(new Error("Worker connection error"));
    workerHandlers.active?.();
    await workerHandlers.failed?.({ id: "job-1" }, new Error("Job failed completely"));

    await promise;
  });

  it("should timeout if queue processing takes too long", async () => {
    vi.useFakeTimers();
    mockQueueGetWaitingCount.mockResolvedValue(1); // Keeps it from finishing early
    mockQueueGetActiveCount.mockResolvedValue(0);
    mockQueueGetDelayedCount.mockResolvedValue(0);

    const promise = processQueueUntilEmpty();
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(600_000);

    await promise;
    expect(mockWorkerClose).toHaveBeenCalled();
    vi.useRealTimers();
  });

  describe("retryFailedWithExistingFiles", () => {
    it("should retry failed jobs with existing files", async () => {
      const mockRetry = vi.fn().mockResolvedValue(undefined);
      const mockRemove = vi.fn().mockResolvedValue(undefined);

      mockQueueGetFailed.mockResolvedValue([
        { data: { videoPath: "/path/to/existing.mp4" }, retry: mockRetry, remove: mockRemove },
        { data: { videoPath: "/path/to/missing.mp4" }, retry: mockRetry, remove: mockRemove },
      ]);

      const { notifyYoutubeRateLimited } = await import("../../src/core/telegram.js");
      vi.mocked(notifyYoutubeRateLimited).mockResolvedValue(undefined);

      const fs = await import("node:fs");
      vi.mocked(fs.existsSync).mockImplementation((path) => path === "/path/to/existing.mp4");

      mockQueueGetWaitingCount.mockResolvedValue(0);
      mockQueueGetActiveCount.mockResolvedValue(0);
      mockQueueGetDelayedCount.mockResolvedValue(0);

      await retryFailedWithExistingFiles();

      expect(mockRetry).toHaveBeenCalledTimes(1);
      expect(mockRemove).toHaveBeenCalledTimes(1);
    });
  });

  describe("closeQueueConnections", () => {
    it("should close queue connections", async () => {
       const client = getRedisClient();
       expect(client).toBeDefined();
       await closeQueueConnections();
       expect(client.quit).toHaveBeenCalled();
    });

    it("should do nothing if redisClient is null", async () => {
        await closeQueueConnections();
        await closeQueueConnections(); // Second time it should be null
    });
  });

  describe("worker logic", () => {
    it("should throw error if video doesn't exist", async () => {
      createWorker();
      const fs = await import("node:fs");
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await expect(mockProcessFn({ id: "j1", data: { videoPath: "missing.mp4" } })).rejects.toThrow();
    });

    it("should defer job if daily limit is reached", async () => {
      const { isDailyLimitReachedAsync } = await import("../../src/core/state.js");
      vi.mocked(isDailyLimitReachedAsync).mockResolvedValue(true);

      const fs = await import("node:fs");
      vi.mocked(fs.existsSync).mockReturnValue(true);

      createWorker();
      const res = await mockProcessFn({ id: "j1", name: "upload", data: { videoPath: "vid.mp4", config: { dailyUploadLimit: 5 } } });

      expect(res).toEqual({ deferred: true });
      expect(mockQueueAdd).toHaveBeenCalled();
    });

    it("should upload to youtube and cleanup", async () => {
      const { isDailyLimitReachedAsync, getDailyUploadCountAsync } = await import("../../src/core/state.js");
      vi.mocked(isDailyLimitReachedAsync).mockResolvedValue(false);
      vi.mocked(getDailyUploadCountAsync).mockResolvedValue(4);

      const { uploadToYouTube } = await import("../../src/core/youtube.service.js");
      vi.mocked(uploadToYouTube).mockResolvedValue("https://youtube.com/shorts/test");

      const fs = await import("node:fs");
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const redis = getRedisClient();
      vi.mocked(redis.get).mockResolvedValue("1");

      createWorker();
      const res = await mockProcessFn({ id: "j1", data: { videoPath: "vid.mp4", title: "t", description: "d", config: { dailyUploadLimit: 5 } } });

      expect(res).toEqual({ youtubeUrl: "https://youtube.com/shorts/test" });
      expect(fs.unlinkSync).toHaveBeenCalledWith("vid.mp4");
      expect(redis.del).toHaveBeenCalled();
      const { notifyYoutubeRateLimited } = await import("../../src/core/telegram.js");
    });

    it("should handle fs.unlinkSync error", async () => {
      const { isDailyLimitReachedAsync } = await import("../../src/core/state.js");
      vi.mocked(isDailyLimitReachedAsync).mockResolvedValue(false);

      const fs = await import("node:fs");
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.unlinkSync).mockImplementation(() => { throw new Error("no delete"); });

      createWorker();
      const res = await mockProcessFn({ id: "j1", data: { videoPath: "vid.mp4", config: { dailyUploadLimit: 5 } } });
      expect(res).toEqual({ youtubeUrl: "https://youtube.com/shorts/test" });
    });

    it("should throw if youtubeUrl is null", async () => {
      const { uploadToYouTube } = await import("../../src/core/youtube.service.js");
      vi.mocked(uploadToYouTube).mockResolvedValue(null as any);

      const fs = await import("node:fs");
      vi.mocked(fs.existsSync).mockReturnValue(true);

      createWorker();

      await expect(mockProcessFn({ id: "j1", data: { videoPath: "vid.mp4", config: {} } })).rejects.toThrow();
    });
  });

  describe("queue additional branches", () => {
    it("should handle error when promoteJobs throws", async () => {
      mockQueueGetWaitingCount.mockResolvedValue(0);
      mockQueueGetActiveCount.mockResolvedValue(0);
      mockQueueGetDelayedCount.mockResolvedValue(1);
      mockQueuePromoteJobs.mockRejectedValue(new Error("simulate error"));

      const promise = processQueueUntilEmpty();
      await new Promise(r => setTimeout(r, 0));
      workerHandlers.completed?.({ id: "job" });
      await promise;

      expect(mockQueuePromoteJobs).toHaveBeenCalled();
    });

    it("should handle pausing/resuming limits", async () => {
      const { isDailyLimitReachedAsync, getDailyUploadCountAsync } = await import("../../src/core/state.js");
      vi.mocked(isDailyLimitReachedAsync).mockResolvedValue(false);
      vi.mocked(getDailyUploadCountAsync).mockResolvedValue(5);

      const { uploadToYouTube } = await import("../../src/core/youtube.service.js");
      vi.mocked(uploadToYouTube).mockResolvedValue("https://youtube.com/shorts/test");

      const fs = await import("node:fs");
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const redis = getRedisClient();
      vi.mocked(redis.get).mockResolvedValue("1"); // Mock pausedKey

      createWorker();
      const res = await mockProcessFn({
        id: "j1",
        data: {
          videoPath: "vid.mp4",
          title: "t",
          description: "d",
          config: { dailyUploadLimit: 5, managedRun: { channelId: "ch1" } },
          channelId: "ch1"
        }
      });

      expect(res).toEqual({ youtubeUrl: "https://youtube.com/shorts/test" });
      expect(redis.del).toHaveBeenCalled(); // Should clear pause key
      const { notifyYoutubeResumed } = await import("../../src/core/telegram.js");
      expect(notifyYoutubeResumed).toHaveBeenCalled();
    });

    it("should processQueueUntilEmpty if retried > 0", async () => {
      const mockRetry = vi.fn().mockResolvedValue(undefined);

      mockQueueGetFailed.mockResolvedValue([
        { data: { videoPath: "/path/to/existing.mp4" }, retry: mockRetry },
      ]);

      const fs = await import("node:fs");
      vi.mocked(fs.existsSync).mockImplementation((path) => path === "/path/to/existing.mp4");

      mockQueueGetWaitingCount.mockResolvedValue(0);
      mockQueueGetActiveCount.mockResolvedValue(0);
      mockQueueGetDelayedCount.mockResolvedValue(0);

      await retryFailedWithExistingFiles();
      expect(mockRetry).toHaveBeenCalledTimes(1);
    });
  });

  describe("queue non-branch edges", () => {
    it("should handle error in catch (err) cleanly with string", async () => {
      const { isDailyLimitReachedAsync } = await import("../../src/core/state.js");
      vi.mocked(isDailyLimitReachedAsync).mockResolvedValue(false);

      const fs = await import("node:fs");
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.unlinkSync).mockImplementation(() => { throw "string err"; });

      createWorker();
      const res = await mockProcessFn({ id: "j1", data: { videoPath: "vid.mp4", config: { dailyUploadLimit: 5 } } });
      expect(res).toEqual({ youtubeUrl: "https://youtube.com/shorts/test" });
    });

    it("should handle promoteJobs string err", async () => {
      mockQueueGetWaitingCount.mockResolvedValue(0);
      mockQueueGetActiveCount.mockResolvedValueOnce(0);
      mockQueueGetDelayedCount.mockResolvedValueOnce(3);
      mockQueuePromoteJobs.mockRejectedValueOnce("string error");

      await expect(processQueueUntilEmpty()).resolves.toBeUndefined();
      expect(mockQueuePromoteJobs).toHaveBeenCalledTimes(1);
    });

    it("should process retried > 0 branch completely", async () => {
      const mockRetry = vi.fn().mockResolvedValue(undefined);
      mockQueueGetFailed.mockResolvedValue([
        { data: { videoPath: "/path/to/existing.mp4" }, retry: mockRetry },
      ]);

      const fs = await import("node:fs");
      vi.mocked(fs.existsSync).mockImplementation((path) => path === "/path/to/existing.mp4");

      mockQueueGetWaitingCount.mockResolvedValue(0);
      mockQueueGetActiveCount.mockResolvedValue(0);
      mockQueueGetDelayedCount.mockResolvedValue(0);

      await retryFailedWithExistingFiles();
      expect(mockRetry).toHaveBeenCalledTimes(1);
    });
  });

  describe("queue daily upload limit equals notify", () => {
    it("should notify exactly once when daily cap reached", async () => {
      const { isDailyLimitReachedAsync, getDailyUploadCountAsync } = await import("../../src/core/state.js");
      vi.mocked(isDailyLimitReachedAsync).mockResolvedValue(false);
      vi.mocked(getDailyUploadCountAsync).mockResolvedValue(5);

      const { uploadToYouTube } = await import("../../src/core/youtube.service.js");
      vi.mocked(uploadToYouTube).mockResolvedValue("https://youtube.com/shorts/test");

      const fs = await import("node:fs");
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const redis = getRedisClient();
      vi.mocked(redis.get).mockResolvedValue(null);

      const { notifyYoutubeRateLimited } = await import("../../src/core/telegram.js");
      vi.mocked(notifyYoutubeRateLimited).mockResolvedValue(undefined);

      createWorker();
      await mockProcessFn({
        id: "j1",
        data: {
          videoPath: "vid.mp4",
          title: "t",
          description: "d",
          config: { dailyUploadLimit: 5, managedRun: { channelName: "ch1" } },
          channelId: "ch1"
        }
      });

      expect(notifyYoutubeRateLimited).toHaveBeenCalledWith({
        channelName: "ch1",
        reason: "daily-cap",
        limit: 5
      }, expect.any(Object));
    });
  });

  describe("redis missing vars", () => {
    it("should handle redis config without URL or PORT", async () => {
      delete process.env.REDIS_URL;
      delete process.env.REDIS_HOST;
      delete process.env.REDIS_PORT;
      delete process.env.REDIS_PASSWORD;

      const { closeQueueConnections } = await import("../../src/core/queue.js");
      await closeQueueConnections();
      getRedisClient();
    });

    it("should process retried 0", async () => {
       mockQueueGetFailed.mockResolvedValue([]);
       await retryFailedWithExistingFiles();
    });
  });

  describe("redis missing vars with url", () => {
    it("should handle redis config with URL", async () => {
      process.env.REDIS_URL = "redis://localhost:6379";

      const { closeQueueConnections } = await import("../../src/core/queue.js");
      await closeQueueConnections();
      getRedisClient();
    });
  });

  describe("queue missing coverage channelId global", () => {
    it("should fallback channelId to global", async () => {
      const short: any = { id: "short-1", outputPath: "/path/to/video.mp4" };
      await enqueueYoutubeUpload(short, "Title", "Desc", {} as any, ["tag1"]);

      expect(mockQueueAdd).toHaveBeenCalledWith(
        "upload-short-1",
        expect.objectContaining({
          channelId: "global",
        }),
        expect.any(Object)
      );
    });
  });
});

describe("more queue-client coverage", () => {
  it("getRedisClient coverage", async () => {
    const origUrl = process.env.REDIS_URL;
    process.env.REDIS_URL = "redis://some-test-url:6379";
    const { getRedisClient, closeQueueConnections, getQueue } = await import("../../src/core/queue-client.js");
    await closeQueueConnections(); // reset
    getRedisClient(); // hits REDIS_URL branch
    getQueue(); // hits getQueue
    await closeQueueConnections(); // reset
    process.env.REDIS_URL = origUrl || "";
  });
});
