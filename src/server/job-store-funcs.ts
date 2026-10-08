import type { PipelineProgress, PipelineResult } from "../types.js";
import { getOptionalPool, queryRows } from "../core/control-plane-db.js";
import { type JobState, jobs, type RunRow, mapRowToJobState } from "./job-store-state.js";

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
