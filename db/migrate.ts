import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { DATA_DIR, MIGRATIONS_DIR, SCREENSHOTS_DIR } from '../lib/paths';

/**
 * Applies any migration file that hasn't run yet, in filename order, each in
 * its own transaction. Runs on boot; a fresh checkout with no ./data gets a
 * complete database and nothing else — no seed data, by design.
 */
export function migrate(db: DatabaseSync): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `);

  const applied = new Set(
    db.prepare('SELECT name FROM schema_migrations').all().map((r) => (r as { name: string }).name),
  );

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const record = db.prepare('INSERT INTO schema_migrations (name) VALUES (?)');

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');

    runSqlFile(db, sql, () => { record.run(file); });
    console.log(`[signature] applied migration ${file}`);
  }
}

/** A migration or rollback that rebuilds a table other tables point at asks for this on its first line. */
export const FOREIGN_KEYS_OFF = '-- signature: foreign-keys-off';

/**
 * One migration or rollback file, all or nothing. node:sqlite has no
 * transaction() helper, so it is driven by hand — and rolled back on failure
 * so a half-applied file can never be recorded.
 *
 * A file that rebuilds a table (the CHECK lists cannot be altered in place)
 * starts with FOREIGN_KEYS_OFF: dropping the old table with foreign keys on
 * would run the ON DELETE actions of every table pointing at it — executions,
 * bars and study notes would go with it. So keys are switched off around the
 * transaction (the pragma does nothing inside one), checked before it commits,
 * and switched back on whatever happens: SQLite's documented rebuild order.
 */
export function runSqlFile(db: DatabaseSync, sql: string, inside?: () => void): void {
  const keysOff = sql.trimStart().startsWith(FOREIGN_KEYS_OFF);
  if (keysOff) db.exec('PRAGMA foreign_keys = OFF');
  try {
    db.exec('BEGIN');
    try {
      db.exec(sql);
      if (keysOff) {
        const broken = db.prepare('PRAGMA foreign_key_check').all();
        if (broken.length) throw new Error(`The rebuild would leave ${broken.length} broken reference(s); nothing was changed.`);
      }
      inside?.();
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  } finally {
    if (keysOff) db.exec('PRAGMA foreign_keys = ON');
  }
}
