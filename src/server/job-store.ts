

import type { ApiGenerateResponse, PipelineProgress, PipelineResult } from "../types.js";
import { getOptionalPool, queryRows } from "../core/control-plane-db.js";
import { createJob, getJob } from "./job-store-funcs.js";
import { type JobState, jobs, type RunRow, type RunSummaryRow, type RunResultsRow, mapRowToJobState, flattenShorts } from "./job-store-state.js";


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








export { type JobState, jobs } from "./job-store-state.js";

export { createJob, getJob } from "./job-store-funcs.js";
