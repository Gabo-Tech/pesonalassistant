import * as SQLite from 'expo-sqlite';

const DB_NAME = 'assistant.db';

/**
 * Bump this when you add a migration below. SQLite stores the current number in
 * `PRAGMA user_version`, so the app can upgrade an existing phone database in
 * place instead of wiping the user's notes.
 */
const SCHEMA_VERSION = 2;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/** Opens (once) and returns the shared database handle. */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  dbPromise ??= openAndMigrate();
  return dbPromise;
}

async function openAndMigrate(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);

  // WAL keeps reads fast while a write is in flight; foreign_keys is off by default in SQLite.
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  await migrate(db);
  return db;
}

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;

  if (version >= SCHEMA_VERSION) return;

  if (version === 0) {
    await db.execAsync(`
      CREATE TABLE notes (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        title      TEXT NOT NULL DEFAULT '',
        body       TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE reminders (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        text            TEXT NOT NULL,
        due_at          INTEGER NOT NULL,
        notification_id TEXT,
        completed       INTEGER NOT NULL DEFAULT 0,
        created_at      INTEGER NOT NULL
      );

      CREATE INDEX reminders_due_idx ON reminders (completed, due_at);

      CREATE TABLE turns (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        role       TEXT NOT NULL,
        text       TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
    version = 1;
  }

  if (version === 1) {
    await db.execAsync(`
      CREATE TABLE facts (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        title      TEXT NOT NULL UNIQUE,
        text       TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
    version = 2;
  }

  await db.execAsync(`PRAGMA user_version = ${version}`);
}

export const now = (): number => Date.now();
