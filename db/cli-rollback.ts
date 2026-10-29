// `npm run migrate:rollback 036` — undoes one migration with its file in
// db/rollback/. Close the app and back up first; it only drops what that
// migration added, never an older column.
import fs from 'node:fs';
import path from 'node:path';
import { getDb } from './index';

export function rollback(prefix: string, db = getDb()): string {
  const dir = path.join(process.cwd(), 'db', 'rollback');
  const file = fs.readdirSync(dir).find((f) => f.startsWith(prefix) && f.endsWith('.sql'));
  if (!file) throw new Error(`No rollback file for ${prefix} in db/rollback.`);
  db.exec('BEGIN');
  try { db.exec(fs.readFileSync(path.join(dir, file), 'utf8')); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
  return file;
}

if (process.argv[2]) console.log(`[signature] rolled back ${rollback(process.argv[2])}`);
