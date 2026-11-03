import 'server-only';
import mysql from 'mysql2/promise';

export type RunResult = {
  changes: number;
  lastInsertRowid: number;
};

export type Sql = {
  all<T>(sql: string, ...params: unknown[]): Promise<T[]>;
  get<T>(sql: string, ...params: unknown[]): Promise<T | undefined>;
  run(sql: string, ...params: unknown[]): Promise<RunResult>;
  exec(sql: string): Promise<void>;
};

const globalForDb = globalThis as unknown as {
  __taroAdminPool?: mysql.Pool;
};

function pool(): mysql.Pool {
  if (!globalForDb.__taroAdminPool) {
    const host = process.env.DB_HOST;
    const user = process.env.DB_USER;
    const database = process.env.DB_NAME;
    if (!host || !user || !database) {
      throw new Error('未配置 DB_HOST / DB_USER / DB_NAME');
    }
    globalForDb.__taroAdminPool = mysql.createPool({
      host,
      port: Number(process.env.DB_PORT || 3306),
      user,
      password: process.env.DB_PASSWORD ?? '',
      database,
      charset: 'utf8mb4',
      timezone: 'Z',
      dateStrings: true,
      connectionLimit: 10,
      waitForConnections: true,
    });
  }
  return globalForDb.__taroAdminPool;
}

function bind(executor: mysql.Pool | mysql.PoolConnection): Sql {
  return {
    async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
      const [rows] = await executor.query(sql, params);
      return rows as T[];
    },
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      const rows = await this.all<T>(sql, ...params);
      return rows[0];
    },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      const [result] = await executor.query(sql, params);
      const header = result as mysql.ResultSetHeader;
      return {
        changes: header.affectedRows ?? 0,
        lastInsertRowid: Number(header.insertId ?? 0),
      };
    },
    async exec(script: string): Promise<void> {
      const statements = script
        .split(';')
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
      for (const statement of statements) {
        await executor.query(statement);
      }
    },
  };
}

export const db: Sql = {
  all: (sql, ...params) => bind(pool()).all(sql, ...params),
  get: (sql, ...params) => bind(pool()).get(sql, ...params),
  run: (sql, ...params) => bind(pool()).run(sql, ...params),
  exec: (sql) => bind(pool()).exec(sql),
};

export async function transaction<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
  const connection = await pool().getConnection();
  try {
    await connection.beginTransaction();
    const result = await fn(bind(connection));
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export function isDuplicateError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === 'ER_DUP_ENTRY',
  );
}
