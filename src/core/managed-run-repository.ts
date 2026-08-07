import type { Pool } from "pg";
import type { PipelineProgress, PipelineResult } from "../types.js";
import { queryRows } from "./control-plane-db.js";

export interface ManagedRunRecord {
  readonly id: string;
  readonly channelId: string;
  readonly requestedBy: string;
  readonly status: string;
  readonly progress: PipelineProgress | null;
  readonly results: readonly PipelineResult[];
  readonly errorMessage: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface RunRow {
  id: string;
  channel_id: string;
  requested_by: string;
  status: string;
  progress: PipelineProgress | null;
  results: PipelineResult[];
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export class ManagedRunRepository {
  constructor(private readonly db: any) {}

  async createRun(runId: string, channelId: string, requestedBy: string, snapshot: unknown): Promise<void> {
    await this.db.query(
      `INSERT INTO pipeline_runs (id, channel_id, requested_by, status, snapshot, progress, results, error_message, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, NULL, $6::jsonb, NULL, NOW(), NOW())`,
      [runId, channelId, requestedBy, "processing", JSON.stringify(snapshot), JSON.stringify([])],
    );
  }

  async updateProgress(runId: string, progress: PipelineProgress): Promise<void> {
    await this.db.query(
      "UPDATE pipeline_runs SET progress = $2::jsonb, updated_at = NOW() WHERE id = $1",
      [runId, JSON.stringify(progress)],
    );
  }

  async completeRun(runId: string, results: readonly PipelineResult[]): Promise<void> {
    await this.db.query(
      "UPDATE pipeline_runs SET status = $2, results = $3::jsonb, updated_at = NOW() WHERE id = $1",
      [runId, "completed", JSON.stringify(results)],
    );
  }

  async failRun(runId: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    await this.db.query(
      "UPDATE pipeline_runs SET status = $2, error_message = $3, updated_at = NOW() WHERE id = $1",
      [runId, "failed", message],
    );
  }

  async listRuns(channelId?: string, limit = 20, offset = 0): Promise<readonly ManagedRunRecord[]> {
    const rows = channelId
      ? await queryRows<RunRow>(this.db, "SELECT * FROM pipeline_runs WHERE channel_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3", [channelId, limit, offset])
      : await queryRows<RunRow>(this.db, "SELECT * FROM pipeline_runs WHERE channel_id IS NOT NULL ORDER BY created_at DESC LIMIT $1 OFFSET $2", [limit, offset]);
    return rows.map(mapRunRow);
  }

  async getRun(runId: string): Promise<ManagedRunRecord | null> {
    const rows = await queryRows<RunRow>(this.db, "SELECT * FROM pipeline_runs WHERE id = $1", [runId]);
    if (rows.length === 0) return null;
    return mapRunRow(rows[0]);
  }
}

function mapRunRow(row: RunRow): ManagedRunRecord {
  return {
    id: row.id,
    channelId: row.channel_id,
    requestedBy: row.requested_by,
    status: row.status,
    progress: row.progress,
    results: row.results,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}