import { describe, it, expect, vi, beforeEach } from "vitest";
import { enqueueYoutubeUpload, processQueueUntilEmpty, createWorker } from "../../src/core/queue.js";

const mockQueueAdd = vi.fn();
const mockQueueGetWaitingCount = vi.fn().mockResolvedValue(0);
const mockQueueGetActiveCount = vi.fn().mockResolvedValue(0);
const mockQueueGetDelayedCount = vi.fn().mockResolvedValue(0);
const mockQueuePromoteJobs = vi.fn().mockResolvedValue(undefined);

vi.mock("bullmq", () => {
  class MockQueue {
    add = mockQueueAdd;
    getWaitingCount = mockQueueGetWaitingCount;
    getActiveCount = mockQueueGetActiveCount;
    getDelayedCount = mockQueueGetDelayedCount;
    promoteJobs = mockQueuePromoteJobs;
  }

  class MockWorker {
    on = vi.fn();
    run = vi.fn().mockResolvedValue(undefined);
    close = vi.fn().mockResolvedValue(undefined);
  }

  return {
    Queue: MockQueue,
    Worker: MockWorker,
  };
});

vi.mock("ioredis", () => {
  class MockRedis {
    quit = vi.fn().mockResolvedValue(undefined);
  }
  return {
    Redis: MockRedis,
  };
});

vi.mock("../../src/core/youtube.service.js", () => ({
  uploadToYouTube: vi.fn().mockResolvedValue("https://youtube.com/shorts/test"),
}));

vi.mock("../../src/core/state.js", () => ({
  isDailyLimitReachedAsync: vi.fn().mockResolvedValue(false),
  incrementDailyUploadCountAsync: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/core/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("node:fs", async () => {
  return {
    default: {
      existsSync: vi.fn().mockReturnValue(true),
    },
    existsSync: vi.fn().mockReturnValue(true),
  };
});

describe("Queue System", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
