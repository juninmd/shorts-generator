import { queryRows } from "./control-plane-db.js";

export interface ScheduleEntry {
  readonly id: string;
  readonly channelId: string;
  readonly cutId: string | null;
  readonly kind: "programmed" | "manual";
  readonly runAt: string;
  readonly createdAt: string;
}

interface ScheduleRow {
  id: string;
  channel_id: string;
  cut_id: string | null;
  kind: "programmed" | "manual";
  run_at: string;
  created_at: string;
}

const toEntry = (row: ScheduleRow): ScheduleEntry => ({
  id: row.id,
  channelId: row.channel_id,
  cutId: row.cut_id,
  kind: row.kind,
  runAt: row.run_at,
  createdAt: row.created_at,
});

export class ChannelScheduleRepository {
  constructor(private readonly db: any) {}

  async listEntries(channelId: string, fromIso: string, toIso: string): Promise<readonly ScheduleEntry[]> {
    const rows = await queryRows<ScheduleRow>(
      this.db,
      "SELECT * FROM channel_schedule_entries WHERE channel_id = $1 AND run_at >= $2 AND run_at < $3 ORDER BY run_at ASC",
      [channelId, fromIso, toIso],
    );
    return rows.map(toEntry);
  }

  async addEntry(entry: ScheduleEntry): Promise<void> {
    await this.db.query(
      `INSERT INTO channel_schedule_entries (id, channel_id, cut_id, kind, run_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [entry.id, entry.channelId, entry.cutId, entry.kind, entry.runAt, entry.createdAt],
    );
  }

  async deleteEntry(channelId: string, entryId: string): Promise<boolean> {
    const result = await this.db.query(
      "DELETE FROM channel_schedule_entries WHERE channel_id = $1 AND id = $2",
      [channelId, entryId],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
