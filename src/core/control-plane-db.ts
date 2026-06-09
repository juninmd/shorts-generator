import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { logger } from "./logger.js";
import { getLocalPool } from "./sqlite-db.js";

export type SqlClient = Pick<Pool, "query"> | Pick<PoolClient, "query">;
export interface DatabaseConnectionConfig {
  readonly databaseUrl: string;
}

let pool: Pool | null = null;

export function getControlPlanePool(config: DatabaseConnectionConfig): SqlClient {
  if (config.databaseUrl.startsWith("sqlite:")) {
    return getLocalPool(config);
  }

  if (pool) {
    return pool;
  }

  pool = new Pool({ connectionString: config.databaseUrl });
  pool.on("error", (error: Error) => {
    logger.error({ error }, "Postgres pool error");
  });
  logger.info({ databaseUrl: redactDatabaseUrl(config.databaseUrl) }, "Control plane DB ready");
  return pool;
}

export async function queryRows<Row extends QueryResultRow>(
  client: SqlClient,
  sql: string,
  values: readonly unknown[] = [],
): Promise<readonly Row[]> {
  const result = await client.query<Row>(sql, [...values]);
  return result.rows;
}

export async function withTransaction<T>(
  db: any,
  work: (client: any) => Promise<T>,
): Promise<T> {
  if (db.withTransaction) {
    return db.withTransaction(work);
  }
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function getOptionalPool(): SqlClient | null {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  return databaseUrl ? getControlPlanePool({ databaseUrl }) : null;
}

function redactDatabaseUrl(databaseUrl: string): string {
  try {
    const url = new URL(databaseUrl);
    if (url.password) {
      url.password = "***";
    }
    return url.toString();
  } catch {
    return "postgres://***";
  }
}