import { randomUUID } from "node:crypto";
import { getOptionalPool, queryRows, type SqlClient } from "../control-plane-db.js";
import { logger } from "../logger.js";

export type EditorialDecisionKind = "approved" | "rejected" | "reevaluated_approved" | "reevaluated_rejected" | "needs_human";

export interface EditorialDecisionInput {
  readonly runId?: string;
  readonly channelId: string;
  readonly sourceVideoId?: string;
  readonly startSec?: number;
  readonly endSec?: number;
  readonly title: string;
  readonly stage: "clip_review" | "editorial_gate" | "quiz_validation" | "metadata" | "human_review";
  readonly decision: EditorialDecisionKind;
  readonly reasons: readonly string[];
  readonly scores?: Record<string, unknown>;
}

export interface EditorialDecisionRecord extends EditorialDecisionInput {
  readonly id: string;
  readonly createdAt: string;
}

export type DecisionRecorder = (input: EditorialDecisionInput) => Promise<void>;

export async function insertEditorialDecision(db: SqlClient, input: EditorialDecisionInput): Promise<string> {
  const id = randomUUID();
  const ms = (v?: number) => (v === undefined ? null : Math.round(v * 1000));
  await db.query(
    `INSERT INTO editorial_decisions (id, run_id, channel_id, source_video_id, source_start_ms, source_end_ms, title, stage, decision, reasons, scores, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [id, input.runId ?? null, input.channelId, input.sourceVideoId ?? null, ms(input.startSec), ms(input.endSec), input.title,
      input.stage, input.decision, JSON.stringify(input.reasons), JSON.stringify(input.scores ?? {}), new Date().toISOString()],
  );
  return id;
}

export async function listEditorialDecisions(db: SqlClient, channelId: string, limit = 50, offset = 0): Promise<EditorialDecisionRecord[]> {
  const rows = await queryRows<Record<string, any>>(db,
    "SELECT * FROM editorial_decisions WHERE channel_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",
    [channelId, Math.min(Math.max(limit, 1), 200), Math.max(offset, 0)]);
  return rows.map((r) => ({
    id: r.id, runId: r.run_id ?? undefined, channelId: r.channel_id, sourceVideoId: r.source_video_id ?? undefined,
    startSec: r.source_start_ms == null ? undefined : r.source_start_ms / 1000,
    endSec: r.source_end_ms == null ? undefined : r.source_end_ms / 1000,
    title: r.title, stage: r.stage, decision: r.decision,
    reasons: typeof r.reasons === "string" ? JSON.parse(r.reasons) : r.reasons,
    scores: typeof r.scores === "string" ? JSON.parse(r.scores) : r.scores,
    createdAt: String(r.created_at),
  }));
}

/** Default recorder: persists when a control-plane DB is configured, always logs. */
export const recordEditorialDecision: DecisionRecorder = async (input) => {
  logger.info({ ...input }, "Editorial decision");
  const db = getOptionalPool();
  if (!db) return;
  try {
    await insertEditorialDecision(db, input);
  } catch (error) {
    // Audit trail must not abort content selection; the decision is still in the logs.
    logger.warn({ error: error instanceof Error ? error.message : String(error) }, "Failed to persist editorial decision");
  }
};
