import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { migrations } from './migrations';

let database: DatabaseSync | null = null;

export function openDatabase(file: string): DatabaseSync {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA synchronous = NORMAL;');
  migrate(db);
  database = db;
  return db;
}

export function db(): DatabaseSync {
  if (!database) throw new Error('Database not initialised');
  return database;
}

export function closeDatabase(): void {
  database?.close();
  database = null;
}

function migrate(conn: DatabaseSync): void {
  const row = conn.prepare('PRAGMA user_version').get() as { user_version: number };
  const current = row.user_version;
  for (let version = current; version < migrations.length; version++) {
    conn.exec('BEGIN');
    try {
      conn.exec(migrations[version]);
      conn.exec(`PRAGMA user_version = ${version + 1}`);
      conn.exec('COMMIT');
    } catch (err) {
      conn.exec('ROLLBACK');
      throw err;
    }
  }
}

/** node:sqlite rejects booleans and undefined; normalise parameters. */
export function p(value: unknown): SQLInputValue {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'bigint') return value;
  if (value instanceof Uint8Array) return value;
  return JSON.stringify(value);
}

export function all<T>(sql: string, ...params: unknown[]): T[] {
  return db().prepare(sql).all(...params.map(p)) as T[];
}

export function get<T>(sql: string, ...params: unknown[]): T | undefined {
  return db().prepare(sql).get(...params.map(p)) as T | undefined;
}

export function run(sql: string, ...params: unknown[]): { changes: number } {
  const result = db().prepare(sql).run(...params.map(p));
  return { changes: Number(result.changes) };
}

export function transaction<T>(fn: () => T): T {
  const conn = db();
  conn.exec('BEGIN');
  try {
    const out = fn();
    conn.exec('COMMIT');
    return out;
  } catch (err) {
    conn.exec('ROLLBACK');
    throw err;
  }
}

/** Escape user input for an FTS5 MATCH query: every term becomes a quoted prefix search. */
export function ftsQuery(input: string): string | null {
  const terms = input
    .split(/\s+/)
    .map((t) => t.replace(/["*^:()]/g, '').trim())
    .filter(Boolean)
    .slice(0, 12);
  if (terms.length === 0) return null;
  return terms.map((t) => `"${t}"*`).join(' ');
}
