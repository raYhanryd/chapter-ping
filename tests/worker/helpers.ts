import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Env } from "../../src/worker/env";

type Row = Record<string, unknown>;

function normalize(value: unknown): unknown {
  if (value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}

class SqliteStatement {
  constructor(
    private readonly db: DatabaseSync,
    private readonly sql: string,
    private readonly params: unknown[] = [],
  ) {}

  bind(...values: unknown[]): SqliteStatement {
    return new SqliteStatement(this.db, this.sql, values.map(normalize));
  }

  async first<T extends object = Row>(column?: string): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...(this.params as never[])) as Row | undefined;
    if (!row) return null;
    if (column !== undefined) return (row[column] ?? null) as T | null;
    return row as T;
  }

  async all<T extends object = Row>(): Promise<{ results: T[]; success: true }> {
    const rows = this.db.prepare(this.sql).all(...(this.params as never[])) as T[];
    return { results: rows, success: true };
  }

  async run(): Promise<{ success: true; meta: { changes: number } }> {
    const result = this.db.prepare(this.sql).run(...(this.params as never[]));
    return { success: true, meta: { changes: Number(result.changes) } };
  }
}

/** Minimal D1 surface used by the Worker routes, backed by real SQLite. */
class SqliteD1 {
  constructor(private readonly db: DatabaseSync) {}

  prepare(sql: string): SqliteStatement {
    return new SqliteStatement(this.db, sql);
  }

  async batch(statements: SqliteStatement[]): Promise<unknown[]> {
    this.db.exec("BEGIN");
    try {
      const results: unknown[] = [];
      for (const statement of statements) results.push(await statement.run());
      this.db.exec("COMMIT");
      return results;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  async exec(sql: string): Promise<{ count: number; duration: number }> {
    this.db.exec(sql);
    return { count: 0, duration: 0 };
  }
}

export interface TestDb {
  db: D1Database;
  env: Env;
  dispose: () => Promise<void>;
}

/** Real SQLite with every shipped migration applied, so tests exercise the migration SQL. */
export async function createTestDb(): Promise<TestDb> {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");

  const dir = join(process.cwd(), "migrations");
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(join(dir, file), "utf8"));
  }

  const db = new SqliteD1(sqlite) as unknown as D1Database;
  const env: Env = { DB: db, APP_URL: "http://localhost:8787", ENVIRONMENT: "development" };

  return {
    db,
    env,
    dispose: async () => {
      sqlite.close();
    },
  };
}

export async function count(db: D1Database, sql: string, ...values: unknown[]): Promise<number> {
  const row = await db
    .prepare(sql)
    .bind(...values)
    .first<{ count: number }>("count");
  return row ?? 0;
}
