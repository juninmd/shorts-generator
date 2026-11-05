import { randomUUID } from "node:crypto";
import { queryRows, type SqlClient } from "../control-plane-db.js";
import type { QuizQuestion } from "./quiz.domain.js";
import { questionHash } from "./quiz.domain.js";
import type { SourceEvidence } from "./quiz-fact-check.js";

export type BankStatus = "approved" | "pending_review" | "rejected";

export interface BankQuestion {
  readonly id: string;
  readonly hash: string;
  readonly theme: string;
  readonly question: QuizQuestion;
  readonly source: SourceEvidence | null;
  readonly verifiedBy: string;
  readonly status: BankStatus;
}

export const REPEAT_WINDOW_DAYS = 90;

function mapRow(r: Record<string, any>): BankQuestion {
  const opcoes = typeof r.options === "string" ? JSON.parse(r.options) : r.options;
  return {
    id: r.id, hash: r.question_hash, theme: r.theme, verifiedBy: r.verified_by, status: r.status,
    question: { pergunta: r.question, opcoes, resposta_correta: r.correct_option },
    source: r.source_url ? { url: r.source_url, title: r.source_title ?? "", excerpt: r.source_excerpt ?? "" } : null,
  };
}

export class QuizBankRepository {
  constructor(private readonly db: SqlClient) {}

  async findByHash(hash: string): Promise<BankQuestion | null> {
    const rows = await queryRows<Record<string, unknown>>(this.db, "SELECT * FROM quiz_questions WHERE question_hash = $1", [hash]);
    return rows[0] ? mapRow(rows[0]) : null;
  }

  /** Inserts a question with its provenance; an existing hash keeps its reviewed state. */
  async upsert(theme: string, q: QuizQuestion, status: BankStatus, verifiedBy: string, source: SourceEvidence | null): Promise<void> {
    const now = new Date().toISOString();
    await this.db.query(
      `INSERT INTO quiz_questions (id, question_hash, theme, question, options, correct_option, source_url, source_title, source_excerpt, verified_by, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12) ON CONFLICT (question_hash) DO NOTHING`,
      [randomUUID(), questionHash(q), theme, q.pergunta, JSON.stringify(q.opcoes), q.resposta_correta,
        source?.url ?? null, source?.title ?? null, source?.excerpt ?? null, verifiedBy, status, now],
    );
  }

  async list(status?: BankStatus, limit = 50, offset = 0): Promise<BankQuestion[]> {
    const bounded = `LIMIT ${Math.min(Math.max(limit, 1), 200)} OFFSET ${Math.max(offset, 0)}`;
    const rows = status
      ? await queryRows<Record<string, unknown>>(this.db, `SELECT * FROM quiz_questions WHERE status = $1 ORDER BY created_at DESC ${bounded}`, [status])
      : await queryRows<Record<string, unknown>>(this.db, `SELECT * FROM quiz_questions ORDER BY created_at DESC ${bounded}`);
    return rows.map(mapRow);
  }

  async review(id: string, status: Exclude<BankStatus, "pending_review">, reviewer: string): Promise<boolean> {
    const result = await this.db.query(
      "UPDATE quiz_questions SET status = $2, reviewed_by = $3, verified_by = CASE WHEN $2 = 'approved' THEN 'human_review' ELSE verified_by END, updated_at = $4 WHERE id = $1",
      [id, status, reviewer, new Date().toISOString()],
    );
    return ((result as { rowCount?: number }).rowCount ?? 0) > 0;
  }

  async recentlyUsed(channelId: string, now = new Date()): Promise<Set<string>> {
    const since = new Date(now.getTime() - REPEAT_WINDOW_DAYS * 86_400_000).toISOString();
    const rows = await queryRows<{ question_hash: string }>(this.db,
      "SELECT question_hash FROM quiz_question_usage WHERE channel_id = $1 AND used_at >= $2 LIMIT 5000", [channelId, since]);
    return new Set(rows.map((r) => r.question_hash));
  }

  async markUsed(channelId: string, hashes: readonly string[], now = new Date()): Promise<void> {
    for (const hash of hashes) {
      await this.db.query("INSERT INTO quiz_question_usage (channel_id, question_hash, used_at) VALUES ($1, $2, $3)", [channelId, hash, now.toISOString()]);
    }
  }

  /** Approved questions for a theme not used recently on the channel (bounded). */
  async approvedUnused(theme: string, channelId: string, limit = 20): Promise<BankQuestion[]> {
    const used = await this.recentlyUsed(channelId);
    const rows = await queryRows<Record<string, unknown>>(this.db,
      "SELECT * FROM quiz_questions WHERE status = 'approved' AND theme = $1 ORDER BY created_at DESC LIMIT 200", [theme]);
    return rows.map(mapRow).filter((q) => !used.has(q.hash)).slice(0, limit);
  }
}
