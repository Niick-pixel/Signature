import 'server-only';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { DATA_DIR, DB_PATH } from '../lib/paths';
import { migrate } from './migrate';
import { backupBeforeMigrations, backupToday } from './backup';
import { folderBackup } from './safeBackup';

/**
 * SQLite comes from `node:sqlite`, built into Node itself.
 *
 * This used to be better-sqlite3, which is a native C++ addon. That meant a
 * prebuilt binary had to exist for your exact platform and Node ABI — and when
 * one doesn't, npm silently falls back to compiling from source, which on
 * Windows demands a full Visual Studio C++ toolchain. Using the runtime's own
 * SQLite removes that entire class of problem: no compiler, no prebuild
 * roulette, no rebuild step when Electron updates, and nothing to package.
 */
export type Db = DatabaseSync;

// One connection per process, cached across dev-server hot reloads.
const globalForDb = globalThis as unknown as { __signatureDb?: DatabaseSync; __signatureTimer?: ReturnType<typeof setInterval> };

export function getDb(): DatabaseSync {
  if (globalForDb.__signatureDb) return globalForDb.__signatureDb;

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH);

  // WAL keeps reads from blocking the write that a capture does.
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA synchronous = NORMAL');
  // Another process on the journal (a migration from the command line, a
  // backup tool) waits up to 3 s for a lock instead of failing at once.
  db.exec('PRAGMA busy_timeout = 3000');

  // A snapshot BEFORE any migration runs. A table-rebuild migration is the one
  // moment this journal is genuinely at risk, and the transaction only protects
  // against a failure the migration notices.
  try {
    backupToday(db);
  } catch (err) {
    // A backup that cannot be written must never stop the app from opening.
    console.warn('[signature] daily backup failed:', err);
  }

  // And again right before an update changes the schema.
  try {
    backupBeforeMigrations(db);
  } catch (err) {
    console.warn('[signature] pre-migration backup failed:', err);
  }

  migrate(db);

  /*
    The daily copy was taken only when the journal was first opened, so an
    app left open for a week made one backup. Check again every hour; a day
    that already has its copy costs one stat call.
  */
  const daily = () => {
    try { backupToday(db); } catch (err) { console.warn('[signature] daily backup failed:', err); }
    // The zip to your second folder (db/safeBackup) — never throws.
    folderBackup(db);
  };
  const hourly = setInterval(daily, 60 * 60 * 1000);
  hourly.unref?.();
  // The first zip of the day waits half a minute, so it never slows opening.
  setTimeout(() => { if (globalForDb.__signatureDb === db) folderBackup(db); }, 30_000).unref?.();

  globalForDb.__signatureDb = db;
  globalForDb.__signatureTimer = hourly;
  return db;
}

/** Closes the journal (a restore swaps the file); the next getDb() reopens and migrates. */
export function closeDb(): void {
  const g = globalForDb;
  if (g.__signatureTimer) clearInterval(g.__signatureTimer);
  g.__signatureDb?.close();
  delete g.__signatureDb;
  delete g.__signatureTimer;
}
