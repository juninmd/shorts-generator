import { describe, it, expect, beforeEach } from "vitest";
import {
  jobs,
  createJob,
  getJob,
  updateJobProgress,
  completeJob,
  failJob,
  listJobs,
  getAllShorts,
} from "../../src/server/job-store.js";
import type { PipelineResult } from "../../src/types.js";

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
});
