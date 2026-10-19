import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import { enqueueSocialPosts, processSocialQueue } from "../../src/core/social-queue.js";
import { configuredPublishers } from "../../src/core/publishers/index.js";
import { publishSocialPost, pruneSocialFiles } from "../../src/core/social-publish.js";

const add = vi.fn();
const counts = { waiting: [0], active: [0] };
const handlers: Record<string, any> = {};
const workerClose = vi.fn().mockResolvedValue(undefined);
let processFn: any;
let runImpl: () => Promise<void>;

vi.mock("bullmq", () => ({
  Queue: class { add = add; getWaitingCount = async () => counts.waiting.shift() ?? 0; getActiveCount = async () => counts.active.shift() ?? 0; },
  Worker: class {
    constructor(_name: string, fn: any) { processFn = fn; }
    on = vi.fn((event: string, cb: any) => { handlers[event] = cb; });
    run = vi.fn(() => runImpl());
    close = workerClose;
  },
}));
vi.mock("../../src/core/queue-client.js", () => ({ getRedisClient: vi.fn(() => ({})) }));
vi.mock("../../src/core/publishers/index.js", () => ({ configuredPublishers: vi.fn() }));
vi.mock("../../src/core/social-publish.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/core/social-publish.js")>()),
  publishSocialPost: vi.fn(), pruneSocialFiles: vi.fn(),
}));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { default: { ...actual, mkdirSync: vi.fn(), copyFileSync: vi.fn() } };
});
vi.mock("../../src/core/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const platform = (name: string, needsPublicUrl: boolean) => ({ name, needsPublicUrl }) as any;
const short = { id: "s1", outputPath: "/out/v/s1.mp4" };
const meta = { title: "Título", description: "Desc", tags: ["nasa"] };
const config = { outputDir: "/out", serverPublicUrl: "https://srv.example" } as any;

describe("enqueueSocialPosts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SOCIAL_SCHEDULE;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T18:30:00Z"));
  });
  afterEach(() => { vi.useRealTimers(); delete process.env.SOCIAL_SCHEDULE; });

  it("does nothing when no platform is configured", async () => {
    vi.mocked(configuredPublishers).mockReturnValue([]);
    expect(await enqueueSocialPosts(short, meta, config)).toBe(0);
    expect(add).not.toHaveBeenCalled();
    expect(fs.copyFileSync).not.toHaveBeenCalled();
  });

  it("skips pull-based platforms without a public server URL", async () => {
    vi.mocked(configuredPublishers).mockReturnValue([platform("tiktok", true)]);
    expect(await enqueueSocialPosts(short, meta, { ...config, serverPublicUrl: undefined })).toBe(0);
  });

  it("copies the video once and queues one delayed job per platform with its own copy", async () => {
    vi.mocked(configuredPublishers).mockReturnValue([platform("bluesky", false), platform("tiktok", true)]);
    expect(await enqueueSocialPosts(short, meta, config)).toBe(2);
    expect(fs.copyFileSync).toHaveBeenCalledTimes(1);
    const [name, data, options] = add.mock.calls[0]!;
    expect(name).toBe("social-s1-bluesky");
    expect(data).toMatchObject({ platform: "bluesky", outputDir: "/out", serverPublicUrl: "https://srv.example" });
    expect(data.publicName).toMatch(/^[\w-]{24}\.mp4$/);
    expect(data.copy.caption).toContain("Título");
    expect(options.delay).toBeGreaterThan(0);
    expect(options.attempts).toBe(3);
    expect(add.mock.calls[1]![1].publicName).toBe(data.publicName);
  });

  it("spreads successive shorts over consecutive peak slots, or posts at once when scheduling is off", async () => {
    vi.mocked(configuredPublishers).mockReturnValue([platform("bluesky", false)]);
    await enqueueSocialPosts(short, meta, config);
    await enqueueSocialPosts(short, meta, config);
    expect(add.mock.calls.at(-1)![2].delay).toBeGreaterThan(add.mock.calls.at(-2)![2].delay);
    process.env.SOCIAL_SCHEDULE = "false";
    await enqueueSocialPosts(short, meta, config);
    expect(add.mock.calls.at(-1)![2].delay).toBe(0);
  });
});

describe("processSocialQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    counts.waiting = [];
    counts.active = [];
    Object.keys(handlers).forEach((key) => delete handlers[key]);
  });

  it("only prunes old files when nothing is due", async () => {
    await processSocialQueue(config);
    expect(workerClose).not.toHaveBeenCalled();
    expect(pruneSocialFiles).toHaveBeenCalledWith(config);
  });

  it("runs the worker until the queue drains, publishing each job", async () => {
    counts.waiting = [1, 0];
    counts.active = [0, 0];
    vi.mocked(publishSocialPost).mockResolvedValue("url");
    runImpl = async () => {
      expect(await processFn({ data: { platform: "bluesky" } })).toBe("url");
      await handlers.completed();
    };
    await processSocialQueue(config);
    expect(workerClose).toHaveBeenCalledTimes(1);
    expect(pruneSocialFiles).toHaveBeenCalled();
  });

  it("keeps waiting while jobs remain, logs failures and errors", async () => {
    counts.waiting = [1, 1, 0];
    counts.active = [0, 0, 0];
    runImpl = async () => {
      handlers.error(new Error("redis"));
      await handlers.failed({ id: "j1" }, new Error("boom"));
      expect(workerClose).not.toHaveBeenCalled();
      await handlers.completed();
    };
    await processSocialQueue(config);
    expect(workerClose).toHaveBeenCalledTimes(1);
  });

  it("propagates a worker start failure", async () => {
    counts.waiting = [1];
    counts.active = [0];
    runImpl = async () => { throw new Error("cannot start"); };
    await expect(processSocialQueue(config)).rejects.toThrow("cannot start");
  });

  it("closes the worker after the 10 minute safety timeout", async () => {
    vi.useFakeTimers();
    counts.waiting = [1];
    counts.active = [0];
    runImpl = () => new Promise(() => {});
    const done = processSocialQueue(config);
    await vi.advanceTimersByTimeAsync(600_000);
    await done;
    expect(workerClose).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
