import { queryRows } from "./control-plane-db.js";

export interface ManualCut {
  readonly id: string;
  readonly channelId: string;
  readonly sourceVideoId: string;
  readonly title: string;
  readonly startSec: number;
  readonly endSec: number;
  readonly createdAt: string;
}

interface CutRow {
  id: string;
  channel_id: string;
  source_video_id: string;
  title: string;
  start_sec: string | number;
  end_sec: string | number;
  created_at: string;
}

const toCut = (row: CutRow): ManualCut => ({
  id: row.id,
  channelId: row.channel_id,
  sourceVideoId: row.source_video_id,
  title: row.title,
  startSec: Number(row.start_sec),
  endSec: Number(row.end_sec),
  createdAt: row.created_at,
});

export class ChannelCutsRepository {
  constructor(private readonly db: any) {}

  async listCuts(channelId: string): Promise<readonly ManualCut[]> {
    const rows = await queryRows<CutRow>(
      this.db,
      "SELECT * FROM channel_manual_cuts WHERE channel_id = $1 ORDER BY created_at DESC",
      [channelId],
    );
    return rows.map(toCut);
  }

  async addCut(cut: ManualCut): Promise<void> {
    await this.db.query(
      `INSERT INTO channel_manual_cuts (id, channel_id, source_video_id, title, start_sec, end_sec, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [cut.id, cut.channelId, cut.sourceVideoId, cut.title, cut.startSec, cut.endSec, cut.createdAt],
    );
  }

  async deleteCut(channelId: string, cutId: string): Promise<boolean> {
    const result = await this.db.query(
      "DELETE FROM channel_manual_cuts WHERE channel_id = $1 AND id = $2",
      [channelId, cutId],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
