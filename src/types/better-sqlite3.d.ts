declare module 'better-sqlite3' {
  interface RunResult {
    changes: number;
    lastInsertRowid: number;
  }

  interface Database {
    prepare(sql: string): Statement;
    exec(sql: string): Database;
    close(): void;
  }

  interface Statement {
    run(...params: any[]): RunResult;
    get(...params: any[]): any;
    all(...params: any[]): any[];
  }

  class Database {
    constructor(filename: string, options?: any);
    prepare(sql: string): Statement;
    exec(sql: string): Database;
    close(): void;
  }

  export = Database;
}
