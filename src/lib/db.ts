import 'server-only';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const globalForDb = globalThis as unknown as {
  __taroAdminDb?: Database.Database;
};

function resolveDatabasePath(): string {
  const configured = process.env.SQLITE_PATH || '../taro-api/data/app.sqlite';
  return path.isAbsolute(configured)
    ? configured
    : path.resolve(/*turbopackIgnore: true*/ process.cwd(), configured);
}

export function getDb(): Database.Database {
  if (!globalForDb.__taroAdminDb) {
    const file = resolveDatabasePath();
    if (!fs.existsSync(file)) {
      throw new Error(`找不到数据库文件：${file}`);
    }
    const db = new Database(file);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    globalForDb.__taroAdminDb = db;
  }
  return globalForDb.__taroAdminDb;
}
