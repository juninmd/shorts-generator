import { queryRows } from "./control-plane-db.js";

export interface SourceAnalysis {
  readonly channelId: string;
  readonly sourceVideoId: string;
  readonly durationSec: number;
  readonly analysis: SourceAnalysisPayload;
  readonly createdAt: string;
}

export interface SourceAnalysisPayload {
  readonly energy: readonly number[];
  readonly replay: readonly number[];
  readonly speakerLanes: readonly { readonly startSec: number; readonly endSec: number; readonly speaker: number }[];
  readonly suggestions: readonly {
    readonly startSec: number;
    readonly endSec: number;
    readonly title: string;
    readonly viralScore: number;
    readonly reason: string;
    readonly scoreBreakdown: { readonly hook: number; readonly flow: number; readonly engagement: number; readonly trend: number };
  }[];
}

interface AnalysisRow {
  channel_id: string;
  source_video_id: string;
  duration_sec: string | number;
  analysis: SourceAnalysisPayload;
  created_at: string;
}

export class ChannelAnalysisRepository {
  constructor(private readonly db: any) {}

  async getAnalysis(channelId: string, sourceVideoId: string): Promise<SourceAnalysis | null> {
    const rows = await queryRows<AnalysisRow>(
      this.db,
      "SELECT * FROM channel_source_analysis WHERE channel_id = $1 AND source_video_id = $2",
      [channelId, sourceVideoId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      channelId: row.channel_id,
      sourceVideoId: row.source_video_id,
      durationSec: Number(row.duration_sec),
      analysis: row.analysis,
      createdAt: row.created_at,
    };
  }

  async saveAnalysis(entry: SourceAnalysis): Promise<void> {
    await this.db.query(
      `INSERT INTO channel_source_analysis (channel_id, source_video_id, duration_sec, analysis, created_at)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       ON CONFLICT (channel_id, source_video_id) DO UPDATE SET duration_sec = EXCLUDED.duration_sec,
       analysis = EXCLUDED.analysis, created_at = EXCLUDED.created_at`,
      [entry.channelId, entry.sourceVideoId, entry.durationSec, JSON.stringify(entry.analysis), entry.createdAt],
    );
  }
}
