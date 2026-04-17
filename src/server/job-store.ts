import type { ApiGenerateResponse, PipelineProgress, PipelineResult } from "../types.js";

export interface JobState {
  status: ApiGenerateResponse["status"];
  results: PipelineResult[];
  progress: PipelineProgress | null;
  createdAt: string;
}

export const jobs = new Map<string, JobState>();

export function createJob(jobId: string): void {
  jobs.set(jobId, {
    status: "processing",
    results: [],
    progress: null,
    createdAt: new Date().toISOString(),
  });
}

export function getJob(jobId: string): JobState | undefined {
  return jobs.get(jobId);
}

export function updateJobProgress(jobId: string, progress: PipelineProgress): void {
  const job = jobs.get(jobId);
  if (job) job.progress = progress;
}

export function completeJob(jobId: string, results: PipelineResult[]): void {
  const job = jobs.get(jobId);
  if (job) {
    job.status = "completed";
    job.results = results;
  }
}

export function failJob(jobId: string, error: unknown): void {
  const job = jobs.get(jobId);
  if (job) {
    job.status = "failed";
    job.progress = {
      stage: "error",
      videoId: "",
      videoTitle: "",
      message: error instanceof Error ? error.message : String(error),
      progress: 0,
    };
  }
}

export function listJobs() {
  return Array.from(jobs.entries()).map(([id, job]) => ({
    jobId: id,
    status: job.status,
    progress: job.progress,
    shortsCount: job.results.reduce((sum, r) => sum + r.shorts.length, 0),
    createdAt: job.createdAt,
  }));
}

export function getAllShorts() {
  return Array.from(jobs.values())
    .filter((j) => j.status === "completed")
    .flatMap((j) =>
      j.results.flatMap((r) =>
        r.shorts.map((s) => ({
          id: s.id,
          videoId: r.videoId,
          title: s.clip.title,
          description: s.clip.description,
          viralScore: s.clip.viralScore,
          duration: s.clip.duration,
          startTime: s.clip.startTime,
          endTime: s.clip.endTime,
          originalVideoUrl: s.originalVideoUrl,
          originalVideoTitle: s.originalVideoTitle,
          channelName: s.channelName,
          status: s.status,
          createdAt: s.createdAt,
          downloadUrl: `/api/shorts/${r.videoId}/${s.id}`,
        })),
      ),
    );
}
