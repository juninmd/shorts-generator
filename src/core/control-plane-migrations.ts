import fs from "node:fs/promises";
import path from "node:path";
import type { Pool } from "pg";
import { queryRows, withTransaction } from "./control-plane-db.js";
import { logger } from "./logger.js";

const MIGRATIONS_DIR = path.resolve("db/migrations");

export async function runControlPlaneMigrations(db: any): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS control_plane_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const migrationFiles = (await fs.readdir(MIGRATIONS_DIR))
    .filter((entry) => entry.endsWith(".sql"))
    .sort();

  for (const fileName of migrationFiles) {
    const alreadyApplied = await queryRows<{ name: string }>(
      db,
      "SELECT name FROM control_plane_migrations WHERE name = $1",
      [fileName],
    );
    if (alreadyApplied.length > 0) {
      continue;
    }

    const sql = await fs.readFile(path.join(MIGRATIONS_DIR, fileName), "utf8");
    await withTransaction(db, async (client) => {
      await client.query(sql);
      await client.query(
        "INSERT INTO control_plane_migrations (name) VALUES ($1)",
        [fileName],
      );
    });
    logger.info({ migration: fileName }, "Migration applied");
  }
}