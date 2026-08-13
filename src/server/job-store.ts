

import type { ApiGenerateResponse, PipelineProgress, PipelineResult } from "../types.js";
import { getOptionalPool, queryRows } from "../core/control-plane-db.js";

export interface JobState {
  status: ApiGenerateResponse["status"];
  results: PipelineResult[];
  progress: PipelineProgress | null;
  createdAt: string;
}

export const jobs = new Map<string, JobState>();

export function createJob(jobId: string): void | Promise<void> {
  const db = getOptionalPool();
  if (db) {
    return db.query(
      `INSERT INTO pipeline_runs (id, channel_id, requested_by, status, snapshot, progress, results, error_message, created_at, updated_at)
       VALUES ($1, NULL, $2, $3, $4::jsonb, NULL, $5::jsonb, NULL, NOW(), NOW())`,
      [jobId, "legacy", "processing", JSON.stringify({ source: "legacy-api" }), JSON.stringify([])],
    ).then(() => undefined);
  }
  jobs.set(jobId, {
    status: "processing",
    results: [],
    progress: null,
    createdAt: new Date().toISOString(),
  });
}

export function getJob(jobId: string): JobState | undefined | Promise<JobState | undefined> {
  const db = getOptionalPool();
  if (db) {
    return queryRows<RunRow>(
      db,
      "SELECT status, progress, results, created_at FROM pipeline_runs WHERE id = $1 AND requested_by = $2",
      [jobId, "legacy"],
    ).then((rows) => {
      const row = rows[0];
      return row ? mapRowToJobState(row) : undefined;
    });
  }
  return jobs.get(jobId);
}

export function updateJobProgress(jobId: string, progress: PipelineProgress): void | Promise<void> {
  const db = getOptionalPool();
  if (db) {
    return db.query(
      "UPDATE pipeline_runs SET progress = $2::jsonb, updated_at = NOW() WHERE id = $1 AND requested_by = $3",
      [jobId, JSON.stringify(progress), "legacy"],
    ).then(() => undefined);
  }
  const job = jobs.get(jobId);
  if (job) job.progress = progress;
}

export function completeJob(jobId: string, results: PipelineResult[]): void | Promise<void> {
  const db = getOptionalPool();
  if (db) {
    return db.query(
      "UPDATE pipeline_runs SET status = $2, results = $3::jsonb, updated_at = NOW() WHERE id = $1 AND requested_by = $4",
      [jobId, "completed", JSON.stringify(results), "legacy"],
    ).then(() => undefined);
  }
  const job = jobs.get(jobId);
  if (job) {
    job.status = "completed";
    job.results = results;
  }
}

export function failJob(jobId: string, error: unknown): void | Promise<void> {
  const failureProgress: PipelineProgress = {
    stage: "error",
    videoId: "",
    videoTitle: "",
    message: error instanceof Error ? error.message : String(error),
    progress: 0,
  };
  const db = getOptionalPool();
  if (db) {
    return db.query(
      "UPDATE pipeline_runs SET status = $2, progress = $3::jsonb, error_message = $4, updated_at = NOW() WHERE id = $1 AND requested_by = $5",
      [jobId, "failed", JSON.stringify(failureProgress), failureProgress.message, "legacy"],
    ).then(() => undefined);
  }
  const job = jobs.get(jobId);
  if (job) {
    job.status = "failed";
    job.progress = failureProgress;
  }
}

export function listJobs() {
  const db = getOptionalPool();
  if (db) {
    return queryRows<RunSummaryRow>(
      db,
      "SELECT id, status, progress, results, created_at FROM pipeline_runs WHERE requested_by = $1 ORDER BY created_at DESC",
      ["legacy"],
    ).then((rows) => rows.map((row) => ({
      jobId: row.id,
      status: row.status,
      progress: row.progress,
      shortsCount: row.results.reduce((sum, result) => sum + result.shorts.length, 0),
      createdAt: row.created_at,
    })));
  }
  return Array.from(jobs.entries()).map(([id, job]) => ({
    jobId: id,
    status: job.status,
    progress: job.progress,
    shortsCount: job.results.reduce((sum, r) => sum + r.shorts.length, 0),
    createdAt: job.createdAt,
  }));
}

export function deleteJob(jobId: string): void | Promise<void> {
  const db = getOptionalPool();
  if (db) {
    return db.query("DELETE FROM pipeline_runs WHERE id = $1 AND requested_by = $2", [jobId, "legacy"]).then(() => undefined);
  }
  jobs.delete(jobId);
}

export function cleanupOldJobs(maxAgeMs = 86_400_000): number {
  if (getOptionalPool()) return 0;
  const cutoff = Date.now() - maxAgeMs;
  let removed = 0;
  for (const [id, job] of jobs) {
    if (new Date(job.createdAt).getTime() < cutoff) {
      jobs.delete(id);
      removed++;
    }
  }
  return removed;
}

export function getAllShorts() {
  const db = getOptionalPool();
  if (db) {
    return queryRows<RunResultsRow>(
      db,
      "SELECT results FROM pipeline_runs WHERE requested_by = $1 AND status = $2 ORDER BY created_at DESC",
      ["legacy", "completed"],
    ).then((rows) => rows.flatMap((row) => flattenShorts(row.results)));
  }
  return Array.from(jobs.values())
    .filter((j) => j.status === "completed")
    .flatMap((j) => flattenShorts(j.results));
}

interface RunRow {
  status: JobState["status"];
  progress: PipelineProgress | null;
  results: PipelineResult[];
  created_at: string;
}

interface RunSummaryRow extends RunRow {
  id: string;
}

interface RunResultsRow {
  results: PipelineResult[];
}

function mapRowToJobState(row: RunRow): JobState {
  return {
    status: row.status,
    progress: row.progress,
    results: row.results,
    createdAt: row.created_at,
  };
}

function flattenShorts(results: readonly PipelineResult[]) {
  return results.flatMap((result) =>
    result.shorts.map((short) => ({
      id: short.id,
      videoId: result.videoId,
      title: short.clip.title,
      description: short.clip.description,
      viralScore: short.clip.viralScore,
      duration: short.clip.duration,
      startTime: short.clip.startTime,
      endTime: short.clip.endTime,
      originalVideoUrl: short.originalVideoUrl,
      originalVideoTitle: short.originalVideoTitle,
      channelName: short.channelName,
      status: short.status,
      createdAt: short.createdAt,
      downloadUrl: `/api/shorts/${result.videoId}/${short.id}`,
    })),
  );
}




