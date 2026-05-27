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
      
      // Remove Postgres type casts
      sqliteSql = sqliteSql.replace(/::jsonb/g, "");
      sqliteSql = sqliteSql.replace(/::text\[\]/g, "");
      sqliteSql = sqliteSql.replace(/::text/g, "");
      sqliteSql = sqliteSql.replace(/TIMESTAMPTZ/g, "DATETIME");
      sqliteSql = sqliteSql.replace(/NOW\(\)/g, "CURRENT_TIMESTAMP");

      // Polyfill for "!= ALL(?)" or "!= ALL(?::text[])" which is Postgres specific
      if (sqliteSql.includes("!= ALL(")) {
        sqliteSql = sqliteSql.replace(/!= ALL\(\?\)/g, "NOT IN (?)");
      }
      
      // Polyfill for "ANY(?)" or "ANY(?::text[])"
      if (sqliteSql.includes("= ANY(")) {
        sqliteSql = sqliteSql.replace(/= ANY\(\?\)/g, "IN (?)");
      }

      const sanitizedParams = params.map(p => {
        if (typeof p === "boolean") return p ? 1 : 0;
        if (Array.isArray(p)) return p.join(","); // Note: IN (?) with join(",") only works for some simple cases
        if (typeof p === "object" && p !== null && !(p instanceof Buffer)) return JSON.stringify(p);
        return p;
      });

      try {
        if (sqliteSql.trim().toUpperCase().startsWith("SELECT")) {
          const rows = db.prepare(sqliteSql).all(sanitizedParams);
          return { rows };
        } else {
          // If there are no params and it looks like multiple statements, use exec
          if (params.length === 0 && sqliteSql.includes(";")) {
            db.exec(sqliteSql);
            return { rows: [], rowCount: 0 };
          }
          const result = db.prepare(sqliteSql).run(sanitizedParams);
          return { rows: [], rowCount: result.changes };
        }
      } catch (error) {
        logger.error({ error, sql, sqliteSql, params }, "SQLite query error");
        throw error;
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
