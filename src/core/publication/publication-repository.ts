import { queryRows, type SqlClient } from "../control-plane-db.js";
import { mapPublicationRow, type ArtifactInput, type PublicationRecord, type PublicationStatus } from "./publication-types.js";

export interface PublicationFilter {
  readonly channelId?: string;
  readonly status?: PublicationStatus;
  readonly runId?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface DraftPatch {
  readonly title?: string;
  readonly descriptionBody?: string;
  readonly tags?: readonly string[];
  readonly reviewNotes?: string;
  readonly startSec?: number;
  readonly endSec?: number;
}

const now = () => new Date().toISOString();
const changed = (result: { rowCount?: number | null }) => (result.rowCount ?? 0) > 0;

/** All state transitions are conditional updates so concurrent actors cannot double-apply them. */
export class PublicationRepository {
  constructor(private readonly db: SqlClient) {}

  async get(id: string): Promise<PublicationRecord | null> {
    const rows = await queryRows<Record<string, unknown>>(this.db, "SELECT * FROM clip_publications WHERE id = $1", [id]);
    return rows[0] ? mapPublicationRow(rows[0]) : null;
  }

  async list(filter: PublicationFilter = {}): Promise<PublicationRecord[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    for (const [column, value] of [["channel_id", filter.channelId], ["status", filter.status], ["run_id", filter.runId]] as const) {
      if (value) { params.push(value); where.push(`${column} = $${params.length}`); }
    }
    const limit = Math.min(Math.max(filter.limit ?? 20, 1), 100);
    const offset = Math.max(filter.offset ?? 0, 0);
    const sql = `SELECT * FROM clip_publications ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
    return (await queryRows<Record<string, unknown>>(this.db, sql, params)).map(mapPublicationRow);
  }

  /** reserved|regenerating -> generated|pending_review|publish_pending, bumping the version. */
  async attachArtifact(id: string, a: ArtifactInput, next: "generated" | "pending_review" | "publish_pending"): Promise<boolean> {
    const autoApproved = next === "publish_pending";
    return changed(await this.db.query(
      `UPDATE clip_publications SET status = $2, artifact_path = $3, subtitle_path = $4, artifact_hash = $5, title = $6,
         description_body = $7, tags = $8, presenter = $9, language = $10, selection_reason = $11, review_notes = $12,
         requires_human_review = $13, theme = $14, version = version + 1,
         approved_version = CASE WHEN $15 THEN version + 1 ELSE NULL END, approved_by = $16, approved_at = $17,
         lease_expires_at = NULL, last_error = NULL, updated_at = $17
       WHERE id = $1 AND status IN ('reserved', 'regenerating')`,
      [id, next, a.artifactPath, a.subtitlePath, a.artifactHash, a.title, a.descriptionBody, JSON.stringify(a.tags),
        a.presenter, a.language, a.selectionReason, a.reviewNotes, a.requiresHumanReview, a.theme ?? null,
        autoApproved, autoApproved ? "auto" : null, now()],
    ));
  }

  /** Any edit bumps the version and drops a previous approval; bound changes require regeneration. */
  async updateDraft(id: string, expectedVersion: number, patch: DraftPatch): Promise<boolean> {
    const current = await this.get(id);
    if (!current || current.version !== expectedVersion || current.status !== "pending_review") return false;
    const boundsChanged = (patch.startSec !== undefined && patch.startSec !== current.sourceStartSec)
      || (patch.endSec !== undefined && patch.endSec !== current.sourceEndSec);
    return changed(await this.db.query(
      `UPDATE clip_publications SET title = $3, description_body = $4, tags = $5, review_notes = $6,
         source_start_ms = $7, source_end_ms = $8, status = $9, version = version + 1,
         approved_version = NULL, approved_by = NULL, approved_at = NULL, updated_at = $10
       WHERE id = $1 AND version = $2 AND status = 'pending_review'`,
      [id, expectedVersion, patch.title ?? current.title, patch.descriptionBody ?? current.descriptionBody,
        JSON.stringify(patch.tags ?? current.tags), patch.reviewNotes ?? current.reviewNotes,
        Math.round((patch.startSec ?? current.sourceStartSec) * 1000), Math.round((patch.endSec ?? current.sourceEndSec) * 1000),
        boundsChanged ? "regenerating" : "pending_review", now()],
    ));
  }

  async approve(id: string, version: number, actor: string): Promise<boolean> {
    const at = now();
    return changed(await this.db.query(
      `UPDATE clip_publications SET status = 'publish_pending', approved_version = $2, approved_by = $3, approved_at = $4, updated_at = $4
       WHERE id = $1 AND version = $2 AND status = 'pending_review'`,
      [id, version, actor, at],
    ));
  }

  async transition(id: string, from: readonly PublicationStatus[], to: PublicationStatus, fields: { version?: number; error?: string; notes?: string; bumpVersion?: boolean } = {}): Promise<boolean> {
    const params: unknown[] = [id, to, now(), fields.error ?? null];
    let sql = `UPDATE clip_publications SET status = $2, updated_at = $3, last_error = COALESCE($4, last_error)`;
    // A bumped version gets a fresh publish job id and needs a new approval.
    if (fields.bumpVersion) sql += ", version = version + 1, approved_version = NULL, approved_by = NULL, approved_at = NULL";
    if (fields.notes !== undefined) { params.push(fields.notes); sql += `, review_notes = $${params.length}`; }
    sql += ` WHERE id = $1 AND status IN (${from.map((s) => `'${s}'`).join(", ")})`;
    if (fields.version !== undefined) { params.push(fields.version); sql += ` AND version = $${params.length}`; }
    return changed(await this.db.query(sql, params));
  }

  /** publish_pending -> publishing, only for the exact approved version. */
  async claimForPublish(id: string, version: number): Promise<boolean> {
    return changed(await this.db.query(
      `UPDATE clip_publications SET status = 'publishing', attempt_count = attempt_count + 1, updated_at = $3
       WHERE id = $1 AND status = 'publish_pending' AND approved_version = $2 AND version = $2`,
      [id, version, now()],
    ));
  }

  async markPublished(id: string, youtubeVideoId: string): Promise<boolean> {
    const at = now();
    return changed(await this.db.query(
      `UPDATE clip_publications SET status = 'published', youtube_video_id = $2, published_at = $3, last_error = NULL, updated_at = $3
       WHERE id = $1 AND status IN ('publishing', 'reconcile_required')`,
      [id, youtubeVideoId, at],
    ));
  }
}
