import * as SQLite from 'expo-sqlite';

const DB_NAME = 'assistant.db';

/**
 * Bump this when you add a migration below. SQLite stores the current number in
 * `PRAGMA user_version`, so the app can upgrade an existing phone database in
 * place instead of wiping the user's notes.
 */
const SCHEMA_VERSION = 7;

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

  if (version === 2) {
    await db.execAsync(`
      CREATE TABLE alarms (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        label           TEXT NOT NULL DEFAULT '',
        hour            INTEGER NOT NULL,
        minute          INTEGER NOT NULL,
        next_at         INTEGER NOT NULL,
        repeat          TEXT NOT NULL DEFAULT 'once',
        enabled         INTEGER NOT NULL DEFAULT 1,
        notification_id TEXT,
        created_at      INTEGER NOT NULL
      );
    `);
    version = 3;
  }

  if (version === 3) {
    // Title has existed since v1; this only speeds list/search on existing phones.
    await db.execAsync('CREATE INDEX IF NOT EXISTS notes_updated_idx ON notes (updated_at DESC);');
    version = 4;
  }

  if (version === 4) {
    await db.execAsync(`
      CREATE TABLE local_events (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        title      TEXT NOT NULL,
        start_at   INTEGER NOT NULL,
        end_at     INTEGER NOT NULL,
        location   TEXT NOT NULL DEFAULT '',
        all_day    INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX local_events_start_idx ON local_events (start_at);
    `);
    version = 5;
  }

  if (version === 5) {
    await db.execAsync(`
      CREATE TABLE tasks (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        title      TEXT NOT NULL,
        notes      TEXT NOT NULL DEFAULT '',
        due_at     INTEGER,
        priority   INTEGER NOT NULL DEFAULT 0,
        status     TEXT NOT NULL DEFAULT 'open',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      ALTER TABLE reminders ADD COLUMN anchor_event_id INTEGER;
    `);
    version = 6;
  }

  if (version === 6) {
    await db.execAsync(`
      CREATE TABLE contacts (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL,
        phone      TEXT NOT NULL DEFAULT '',
        preferred  TEXT NOT NULL DEFAULT 'whatsapp',
        notes      TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      ALTER TABLE local_events ADD COLUMN repeat TEXT NOT NULL DEFAULT 'none';
      ALTER TABLE local_events ADD COLUMN alert_minutes INTEGER;
      ALTER TABLE local_events ADD COLUMN alert_notification_id TEXT;
      ALTER TABLE reminders ADD COLUMN repeat TEXT NOT NULL DEFAULT 'once';
    `);
    version = 7;
  }

  await db.execAsync(`PRAGMA user_version = ${version}`);
}

export const now = (): number => Date.now();
