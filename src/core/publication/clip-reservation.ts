import { createHash, randomUUID } from "node:crypto";
import { queryRows, withTransaction, type SqlClient } from "../control-plane-db.js";
import { jaccard, normalizeText, shingles } from "../text-normalize.js";
import type { ReservationInput, ReservationResult } from "./publication-types.js";

export const NEAR_DUPLICATE_THRESHOLD = 0.6;
const DEFAULT_LEASE_MS = 2 * 60 * 60 * 1000;
const RECENT_WINDOW = 500;
const ACTIVE = "status NOT IN ('failed', 'rejected', 'expired')";

export function textSignature(text: string): string {
  return createHash("sha256").update(normalizeText(text)).digest("hex");
}

// SQLite shares one connection: serialize transactions in-process. Postgres serializes via the lock row.
const chains = new WeakMap<object, Promise<unknown>>();
function serialized<T>(db: object, work: () => Promise<T>): Promise<T> {
  const previous = chains.get(db) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(work);
  chains.set(db, next);
  return next;
}

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; message?: string };
  return e?.code === "23505" || /UNIQUE constraint failed/i.test(e?.message ?? "");
}

/**
 * Atomically reserve an ORIGINAL-video interval for a destination channel.
 * Blocks overlapping intervals of the same source and textually equivalent
 * content already reserved/generated/published on the same channel.
 */
export function reserveClip(db: SqlClient, input: ReservationInput, now = new Date()): Promise<ReservationResult> {
  const startMs = Math.round(input.startSec * 1000);
  const endMs = Math.round(input.endSec * 1000);
  if (!(endMs > startMs) || startMs < 0) throw new Error("reserveClip: invalid interval");
  const nowIso = now.toISOString();
  const signature = textSignature(input.text);
  return serialized(db, async () => {
    try {
      return await withTransaction(db, async (tx: SqlClient): Promise<ReservationResult> => {
        await tx.query(
          `INSERT INTO clip_reservation_locks (channel_id, source_video_id, locked_at) VALUES ($1, $2, $3)
           ON CONFLICT (channel_id, source_video_id) DO UPDATE SET locked_at = EXCLUDED.locked_at`,
          [input.channelId, input.sourceVideoId, nowIso],
        );
        await tx.query(
          "UPDATE clip_publications SET status = 'expired', updated_at = $1 WHERE channel_id = $2 AND status = 'reserved' AND lease_expires_at < $1",
          [nowIso, input.channelId],
        );
        const overlap = await queryRows<{ id: string }>(tx,
          `SELECT id FROM clip_publications WHERE channel_id = $1 AND source_video_id = $2 AND ${ACTIVE}
           AND source_start_ms < $3 AND source_end_ms > $4 LIMIT 1`,
          [input.channelId, input.sourceVideoId, endMs, startMs]);
        if (overlap[0]) return { reserved: false, reason: "overlap", conflictId: overlap[0].id };

        const mine = shingles(input.text);
        const recent = await queryRows<{ id: string; normalized_text: string; text_signature: string }>(tx,
          `SELECT id, normalized_text, text_signature FROM clip_publications WHERE channel_id = $1 AND ${ACTIVE}
           ORDER BY created_at DESC LIMIT ${RECENT_WINDOW}`,
          [input.channelId]);
        const duplicate = recent.find((row) => row.text_signature === signature
          || jaccard(mine, shingles(row.normalized_text)) >= NEAR_DUPLICATE_THRESHOLD);
        if (duplicate) return { reserved: false, reason: "duplicate_text", conflictId: duplicate.id };

        const id = randomUUID();
        const lease = new Date(now.getTime() + (input.leaseMs ?? DEFAULT_LEASE_MS)).toISOString();
        await tx.query(
          `INSERT INTO clip_publications (id, channel_id, run_id, source_video_id, source_url, source_start_ms, source_end_ms,
             text_signature, normalized_text, status, format, lease_expires_at, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'reserved',$10,$11,$12,$12)`,
          [id, input.channelId, input.runId ?? null, input.sourceVideoId, input.sourceUrl, startMs, endMs,
            signature, normalizeText(input.text).slice(0, 4000), input.format ?? "cuts", lease, nowIso],
        );
        return { reserved: true, id };
      });
    } catch (error) {
      if (isUniqueViolation(error)) return { reserved: false, reason: "duplicate_text" };
      throw error;
    }
  });
}
