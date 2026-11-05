import type { PipelineResult } from "../../types.js";
import { queryRows, withTransaction, type SqlClient } from "../control-plane-db.js";
import { ManagedRunRepository } from "../managed-run-repository.js";
import { compactResults, deriveRunStatus, summarizeRun, type RunStatus } from "./run-status.js";

export interface RunCheckpoint {
  readonly completedVideoIds: string[];
  readonly results: PipelineResult[];
}

export interface RunOptions {
  readonly kind: "cuts" | "quiz";
  readonly quizTopic?: string;
  readonly overrides?: Record<string, unknown>;
}

const EMPTY: RunCheckpoint = { completedVideoIds: [], results: [] };
const parse = <T>(v: unknown, fallback: T): T => {
  if (v == null) return fallback;
  if (typeof v !== "string") return v as T;
  try { return JSON.parse(v) as T; } catch { return fallback; }
};

export class DurableRunRepository extends ManagedRunRepository {
  constructor(private readonly sql: SqlClient) {
    super(sql);
  }

  async createQueuedRun(runId: string, channelId: string, requestedBy: string, snapshot: unknown, options: RunOptions): Promise<void> {
    await this.createRun(runId, channelId, requestedBy, snapshot);
    await this.sql.query("UPDATE pipeline_runs SET status = 'queued', options = $2 WHERE id = $1", [runId, JSON.stringify(options)]);
  }

  async getExecutionState(runId: string): Promise<{ channelId: string; status: string; options: RunOptions; checkpoint: RunCheckpoint; attempts: number } | null> {
    const rows = await queryRows<Record<string, any>>(this.sql, "SELECT channel_id, status, options, checkpoint, attempts FROM pipeline_runs WHERE id = $1", [runId]);
    const row = rows[0];
    if (!row) return null;
    return { channelId: row.channel_id, status: row.status, options: parse(row.options, { kind: "cuts" }), checkpoint: parse(row.checkpoint, EMPTY), attempts: Number(row.attempts ?? 0) };
  }

  /** One processing run per channel; an expired lease (crashed worker) can be taken over. */
  async acquireLease(runId: string, channelId: string, owner: string, ttlMs: number, now = new Date()): Promise<boolean> {
    const nowIso = now.toISOString();
    return withTransaction(this.sql, async (tx: SqlClient) => {
      await tx.query(
        `INSERT INTO clip_reservation_locks (channel_id, source_video_id, locked_at) VALUES ($1, '__run__', $2)
         ON CONFLICT (channel_id, source_video_id) DO UPDATE SET locked_at = EXCLUDED.locked_at`, [channelId, nowIso]);
      const result = await tx.query(
        `UPDATE pipeline_runs SET status = 'processing', lease_owner = $2, lease_expires_at = $3, attempts = attempts + 1, updated_at = $4
         WHERE id = $1 AND status IN ('queued', 'processing', 'failed', 'partial_failure')
           AND (lease_expires_at IS NULL OR lease_expires_at < $4 OR lease_owner = $2)
           AND NOT EXISTS (SELECT 1 FROM pipeline_runs o WHERE o.channel_id = $5 AND o.id <> $1
             AND o.status = 'processing' AND o.lease_expires_at >= $4)`,
        [runId, owner, new Date(now.getTime() + ttlMs).toISOString(), nowIso, channelId]);
      return ((result as { rowCount?: number }).rowCount ?? 0) > 0;
    });
  }

  async renewLease(runId: string, owner: string, ttlMs: number): Promise<void> {
    await this.sql.query("UPDATE pipeline_runs SET lease_expires_at = $3 WHERE id = $1 AND lease_owner = $2 AND status = 'processing'",
      [runId, owner, new Date(Date.now() + ttlMs).toISOString()]);
  }

  async saveCheckpoint(runId: string, checkpoint: RunCheckpoint): Promise<void> {
    const compact = { ...checkpoint, results: compactResults(checkpoint.results) };
    await this.sql.query("UPDATE pipeline_runs SET checkpoint = $2, results = $3, updated_at = $4 WHERE id = $1",
      [runId, JSON.stringify(compact), JSON.stringify(compact.results), new Date().toISOString()]);
  }

  async publicationStatuses(runId: string): Promise<string[]> {
    const rows = await queryRows<{ status: string }>(this.sql, "SELECT status FROM clip_publications WHERE run_id = $1 LIMIT 1000", [runId]);
    return rows.map((r) => r.status);
  }

  /** Persists the derived status (never a blanket "completed"). */
  async finishRun(runId: string, results: readonly PipelineResult[]): Promise<RunStatus> {
    const statuses = await this.publicationStatuses(runId);
    const status = deriveRunStatus(results, statuses.length ? statuses : undefined);
    const errors = results.flatMap((r) => r.errors);
    await this.sql.query(
      "UPDATE pipeline_runs SET status = $2, results = $3, summary = $4, error_message = $5, lease_owner = NULL, lease_expires_at = NULL, updated_at = $6 WHERE id = $1",
      [runId, status, JSON.stringify(compactResults(results)), JSON.stringify(summarizeRun(results, statuses)), errors.length ? errors.slice(0, 5).join(" | ") : null, new Date().toISOString()]);
    return status;
  }

  /** Called after publication state changes (approval, publish worker) to keep the run truthful. */
  async refreshStatus(runId: string): Promise<RunStatus | null> {
    const state = await this.getExecutionState(runId);
    if (!state || state.status === "processing" || state.status === "queued") return null;
    return this.finishRun(runId, state.checkpoint.results);
  }

  async markFailed(runId: string, error: unknown): Promise<void> {
    await this.failRun(runId, error);
    await this.sql.query("UPDATE pipeline_runs SET lease_owner = NULL, lease_expires_at = NULL WHERE id = $1", [runId]);
  }

  async requeue(runId: string): Promise<boolean> {
    const result = await this.sql.query("UPDATE pipeline_runs SET status = 'queued', error_message = NULL, updated_at = $2 WHERE id = $1 AND status IN ('failed', 'partial_failure')",
      [runId, new Date().toISOString()]);
    return ((result as { rowCount?: number }).rowCount ?? 0) > 0;
  }
}
