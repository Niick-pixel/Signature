import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { BACKUPS_DIR, DATA_DIR, DB_PATH, SCREENSHOTS_DIR } from '../lib/paths';
import { localDay } from '../lib/day';
import { makeZip } from '../lib/zip';
import { readZip } from '../lib/unzip';
import { backupNow } from './backup';
import { restoreScreenshotFile, writeAtomic } from './screenshots';

/*
  Backups you can trust.

  The daily copies (db/backup.ts) sit in the journal's own folder — same disk —
  hold no screenshots, and there was no way back from inside the app. This
  adds:

    - a second folder you choose (another drive, a synced folder), which gets
      one zip a day: the journal and every chart, newest 14 kept;
    - Restore, from either place. It takes a safety copy of the journal as it
      is first, checks the backup is a sound SQLite file, swaps it in, puts its
      charts back (never over a file that is there), and reopens — migrating
      an older backup forward.

  The folder is remembered in a small file beside the journal rather than in
  the journal itself, so a restore never forgets where the backups live.
*/

const KEEP_ZIPS = 14;
/** A path in the folder you chose — a run-time location, never source (turbopackIgnore; see lib/paths). */
const at = (folder: string, ...rest: string[]) => path.join(/* turbopackIgnore: true */ folder, ...rest);
const CONFIG = () => path.join(DATA_DIR, 'backup-folder.json');
const ZIP_RE = /^Signature-backup-\d{4}-\d{2}-\d{2}(-\d{6})?\.zip$/;

interface FolderConfig { folder: string | null; lastOk?: string; lastError?: string }

function readConfig(): FolderConfig {
  try { return { folder: null, ...JSON.parse(fs.readFileSync(CONFIG(), 'utf8')) }; } catch { return { folder: null }; }
}
function writeConfig(c: FolderConfig): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CONFIG(), JSON.stringify(c, null, 2));
}

export function backupFolder(): FolderConfig { return readConfig(); }

/** Sets (or clears, with null) the second folder. Refuses one inside the journal's own folder. */
export function setBackupFolder(folder: string | null): { ok: true } | { ok: false; error: string } {
  if (folder == null || folder.trim() === '') { writeConfig({ folder: null }); return { ok: true }; }
  const abs = path.resolve(/* turbopackIgnore: true */ folder.trim());
  if (!path.isAbsolute(folder.trim())) return { ok: false, error: 'Use a full path, like D:\\Backups.' };
  const inside = path.relative(path.resolve(DATA_DIR), abs);
  if (inside === '' || (!inside.startsWith('..') && !path.isAbsolute(inside))) {
    return { ok: false, error: 'Pick a folder outside the journal folder — ideally on another drive.' };
  }
  try {
    fs.mkdirSync(abs, { recursive: true });
    const probe = path.join(abs, `.signature-write-test-${process.pid}`);
    fs.writeFileSync(probe, 'ok'); fs.rmSync(probe);
  } catch { return { ok: false, error: 'Signature cannot write to that folder.' }; }
  writeConfig({ ...readConfig(), folder: abs, lastError: undefined });
  return { ok: true };
}

/** A consistent copy of the journal as bytes (VACUUM INTO — WAL-safe). */
function snapshotBytes(db: DatabaseSync): Buffer {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  const tmp = path.join(BACKUPS_DIR, `.snapshot-${process.pid}-${Date.now()}.db`);
  db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
  try { return fs.readFileSync(tmp); } finally { fs.rmSync(tmp, { force: true }); }
}

function screenshotEntries(): Array<{ name: string; data: Buffer }> {
  const out: Array<{ name: string; data: Buffer }> = [];
  const walk = (dir: string, rel: string) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), r);
      else if (!e.name.endsWith('.tmp')) out.push({ name: `screenshots/${r}`, data: fs.readFileSync(path.join(dir, e.name)) });
    }
  };
  walk(SCREENSHOTS_DIR, '');
  return out;
}

/**
 * Today's zip in the second folder, if one is set and today's is not there
 * yet (or always, with `force`). Never throws: a failure is remembered and
 * shown in Settings.
 */
export function folderBackup(db: DatabaseSync, force = false): string | null {
  const cfg = readConfig();
  if (!cfg.folder) return null;
  try {
    const day = localDay();
    const dir = at(cfg.folder);
    const existing = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => ZIP_RE.test(f)) : [];
    if (!force && existing.some((f) => f.startsWith(`Signature-backup-${day}`))) return null;
    const now = new Date();
    const hms = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    const name = force ? `Signature-backup-${day}-${hms}.zip` : `Signature-backup-${day}.zip`;
    const zip = makeZip([{ name: 'journal.db', data: snapshotBytes(db) }, ...screenshotEntries()], now);
    fs.mkdirSync(dir, { recursive: true });
    writeAtomic(at(dir, name), zip);
    const all = fs.readdirSync(dir).filter((f) => ZIP_RE.test(f)).sort().reverse();
    for (const stale of all.slice(KEEP_ZIPS)) fs.rmSync(at(dir, stale), { force: true });
    writeConfig({ ...readConfig(), lastOk: now.toISOString(), lastError: undefined });
    return at(dir, name);
  } catch (err) {
    writeConfig({ ...readConfig(), lastError: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

export interface RestorePoint { source: 'local' | 'folder'; name: string; bytes: number; taken: string }

export function restorePoints(): RestorePoint[] {
  const list: RestorePoint[] = [];
  const add = (source: RestorePoint['source'], dir: string, ok: (f: string) => boolean) => {
    if (!dir || !fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir).filter(ok)) {
      const s = fs.statSync(path.join(dir, name));
      list.push({ source, name, bytes: s.size, taken: s.mtime.toISOString() });
    }
  };
  add('local', BACKUPS_DIR, (f) => /^journal-.*\.db$/.test(f));
  const folder = readConfig().folder;
  if (folder) add('folder', at(folder), (f) => ZIP_RE.test(f));
  return list.sort((a, b) => b.taken.localeCompare(a.taken));
}

const SQLITE_HEADER = Buffer.from('SQLite format 3\0', 'latin1');

/** Whether these bytes are a sound Signature journal. */
function checkJournal(bytes: Buffer): string | null {
  if (bytes.length < 100 || !bytes.subarray(0, 16).equals(SQLITE_HEADER)) return 'That backup is not a SQLite database.';
  const probe = path.join(BACKUPS_DIR, `.probe-${process.pid}-${Date.now()}.db`);
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  fs.writeFileSync(probe, bytes);
  try {
    const db = new DatabaseSync(probe);
    try {
      const ok = (db.prepare('PRAGMA integrity_check').get() as Record<string, string>);
      if (Object.values(ok)[0] !== 'ok') return 'That backup is damaged (integrity check failed).';
      if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'trades'").get()) return 'That backup is not a Signature journal.';
    } finally { db.close(); }
    return null;
  } finally { fs.rmSync(probe, { force: true }); }
}

/**
 * Restores a backup over the journal. `close` shuts the open connection (the
 * caller owns it); the next getDb() reopens and migrates.
 */
export function restoreBackup(db: DatabaseSync, close: () => void, point: { source: 'local' | 'folder'; name: string }):
  { ok: true; safety: string; charts: number } | { ok: false; error: string } {
  let bytes: Buffer; let charts: Map<string, Buffer> | null = null;
  if (point.source === 'local') {
    if (!/^journal-[\w.-]+\.db$/.test(point.name)) return { ok: false, error: 'Unknown backup.' };
    const file = path.join(BACKUPS_DIR, point.name);
    if (!fs.existsSync(file)) return { ok: false, error: 'That backup is gone.' };
    bytes = fs.readFileSync(file);
  } else {
    const folder = readConfig().folder;
    if (!folder || !ZIP_RE.test(point.name)) return { ok: false, error: 'Unknown backup.' };
    const file = at(folder, point.name);
    if (!fs.existsSync(file)) return { ok: false, error: 'That backup is gone.' };
    let files: Map<string, Buffer>;
    try { files = readZip(fs.readFileSync(file)); } catch { return { ok: false, error: 'That zip could not be read.' }; }
    const j = files.get('journal.db');
    if (!j) return { ok: false, error: 'That zip has no journal in it.' };
    bytes = j; charts = files;
  }
  const bad = checkJournal(bytes);
  if (bad) return { ok: false, error: bad };

  // The journal as it is now, kept before anything is replaced.
  const safety = backupNow(db);
  close();
  for (const f of ['-wal', '-shm']) fs.rmSync(`${DB_PATH}${f}`, { force: true });
  writeAtomic(DB_PATH, bytes);
  let n = 0;
  if (charts) for (const [name, data] of charts) if (name.startsWith('screenshots/') && restoreScreenshotFile(name.slice(12), data)) n += 1;
  return { ok: true, safety: path.basename(safety), charts: n };
}
