import { DatabaseConnectionConfig, SqlClient } from "./control-plane-db.js";
import { logger } from "./logger.js";
import Database from "better-sqlite3";

export function getLocalPool(config: DatabaseConnectionConfig): SqlClient {
  const dbPath = config.databaseUrl.replace("sqlite:", "");
  const db = new Database(dbPath);
  
  logger.info({ dbPath }, "Using SQLite for local development");

  const proxy = {
    query: async (sql: string, params: any[] = []) => {
      // Basic Postgres-to-SQLite parameter conversion ($1 -> ?)
      let sqliteSql = sql.replace(/\$(\d+)/g, "?");
      
      // Polyfill for "!= ALL(?::text[])" which is Postgres specific
      if (sqliteSql.includes("!= ALL(")) {
        sqliteSql = sqliteSql.replace(/!= ALL\(\?\s*(::\w+\[\])?\)/g, "NOT IN (?)");
      }

      const sanitizedParams = params.map(p => {
        if (typeof p === "boolean") return p ? 1 : 0;
        if (Array.isArray(p)) return p.join(","); // Simplify for local dev (suitable for small sets)
        if (typeof p === "object" && p !== null && !(p instanceof Buffer)) return JSON.stringify(p);
        return p;
      });

      if (sqliteSql.trim().toUpperCase().startsWith("SELECT")) {
        const rows = db.prepare(sqliteSql).all(sanitizedParams);
        return { rows };
      } else {
        const result = db.prepare(sqliteSql).run(sanitizedParams);
        return { rows: [], rowCount: result.changes };
      }
    },
    connect: async () => ({
      query: proxy.query,
      release: () => {}
    }),
    withTransaction: async (work: any) => {
      db.prepare("BEGIN").run();
      try {
        const result = await work(proxy);
        db.prepare("COMMIT").run();
        return result;
      } catch (err) {
        db.prepare("ROLLBACK").run();
        throw err;
      }
    },
    end: async () => {
      db.close();
    }
  } as any;

  return proxy;
}
