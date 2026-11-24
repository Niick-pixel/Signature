import 'server-only';
import crypto from 'node:crypto';
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
const ZIP_RE = /^Signature-backup-\d{4}-\d{2}-\d{2}(-\d{6})?\.zip(\.enc)?$/;

interface FolderConfig {
  folder: string | null; lastOk?: string; lastError?: string;
  /** A password set for the second copy: its scrypt key (hex) and salt. The key stays on this computer. */
  key?: string; salt?: string;
  /** The journal's own integrity check (PRAGMA quick_check), weekly. */
  checkedAt?: string; checkOk?: boolean; checkDetail?: string;
}

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
    // With a password: the zip is sealed (AES-256-GCM); without the password it cannot be read.
    const written = cfg.key && cfg.salt ? `${name}.enc` : name;
    writeAtomic(at(dir, written), cfg.key && cfg.salt ? seal(zip, Buffer.from(cfg.key, 'hex'), Buffer.from(cfg.salt, 'hex')) : zip);
    const all = fs.readdirSync(dir).filter((f) => ZIP_RE.test(f)).sort().reverse();
    for (const stale of all.slice(KEEP_ZIPS)) fs.rmSync(at(dir, stale), { force: true });
    writeConfig({ ...readConfig(), lastOk: now.toISOString(), lastError: undefined });
    return at(dir, written);
  } catch (err) {
    writeConfig({ ...readConfig(), lastError: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

export interface RestorePoint { source: 'local' | 'folder'; name: string; bytes: number; taken: string; sealed?: boolean }

export function restorePoints(): RestorePoint[] {
  const list: RestorePoint[] = [];
  const add = (source: RestorePoint['source'], dir: string, ok: (f: string) => boolean) => {
    if (!dir || !fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir).filter(ok)) {
      const s = fs.statSync(path.join(dir, name));
      list.push({ source, name, bytes: s.size, taken: s.mtime.toISOString(), ...(name.endsWith('.enc') ? { sealed: true } : {}) });
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
export function restoreBackup(db: DatabaseSync, close: () => void, point: { source: 'local' | 'folder'; name: string; password?: string }):
  { ok: true; safety: string; charts: number } | { ok: false; error: string; needsPassword?: boolean } {
  const read = readPoint(point);
  if (!read.ok) return read;
  const { bytes, charts } = read;
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

/* ───────────────────── reading a backup (restore and its preview) ───────────────────── */

type Read = { ok: true; bytes: Buffer; charts: Map<string, Buffer> | null } | { ok: false; error: string; needsPassword?: boolean };

/** A backup's journal (and charts, from a zip): decrypted when sealed, with the saved key or the password given. */
function readPoint(point: { source: 'local' | 'folder'; name: string; password?: string }): Read {
  if (point.source === 'local') {
    if (!/^journal-[\w.-]+\.db$/.test(point.name)) return { ok: false, error: 'Unknown backup.' };
    const file = path.join(BACKUPS_DIR, point.name);
    if (!fs.existsSync(file)) return { ok: false, error: 'That backup is gone.' };
    return { ok: true, bytes: fs.readFileSync(file), charts: null };
  }
  const cfg = readConfig();
  if (!cfg.folder || !ZIP_RE.test(point.name)) return { ok: false, error: 'Unknown backup.' };
  const file = at(cfg.folder, point.name);
  if (!fs.existsSync(file)) return { ok: false, error: 'That backup is gone.' };
  let raw: Buffer = fs.readFileSync(file);
  if (point.name.endsWith('.enc')) {
    const opened = unseal(raw, point.password ?? null, cfg);
    if (!opened.ok) return opened;
    raw = opened.bytes;
  }
  let files: Map<string, Buffer>;
  try { files = readZip(raw); } catch { return { ok: false, error: 'That zip could not be read.' }; }
  const j = files.get('journal.db');
  if (!j) return { ok: false, error: 'That zip has no journal in it.' };
  return { ok: true, bytes: j, charts: files };
}

/* ───────────────────── the password ───────────────────── */

const MAGIC = Buffer.from('SIGENC1\n', 'latin1');
const keyFrom = (password: string, salt: Buffer) => crypto.scryptSync(password, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });

/** MAGIC · salt (16) · iv (12) · tag (16) · ciphertext. */
export function seal(data: Buffer, key: Buffer, salt: Buffer): Buffer {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([c.update(data), c.final()]);
  return Buffer.concat([MAGIC, salt, iv, c.getAuthTag(), body]);
}
function unseal(raw: Buffer, password: string | null, cfg: FolderConfig): { ok: true; bytes: Buffer } | { ok: false; error: string; needsPassword?: boolean } {
  if (raw.length < MAGIC.length + 44 || !raw.subarray(0, MAGIC.length).equals(MAGIC)) return { ok: false, error: 'That backup is not a sealed Signature backup.' };
  let o = MAGIC.length;
  const salt = raw.subarray(o, o += 16); const iv = raw.subarray(o, o += 12); const tag = raw.subarray(o, o += 16); const body = raw.subarray(o);
  // The key saved on this computer opens backups sealed with it; another computer needs the password.
  const key = password ? keyFrom(password, salt) : cfg.key && cfg.salt && Buffer.from(cfg.salt, 'hex').equals(salt) ? Buffer.from(cfg.key, 'hex') : null;
  if (!key) return { ok: false, error: 'This backup is sealed with a password. Enter it to open it.', needsPassword: true };
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', key, iv); d.setAuthTag(tag);
    return { ok: true, bytes: Buffer.concat([d.update(body), d.final()]) };
  } catch { return { ok: false, error: 'Wrong password — or the backup is damaged.', needsPassword: true }; }
}

/** Sets (or, with null, removes) the password for the second copy. Later zips are sealed with it. */
export function setBackupPassword(password: string | null): { ok: true } | { ok: false; error: string } {
  const cfg = readConfig();
  if (password == null || password === '') { const { key: _k, salt: _s, ...rest } = cfg; void _k; void _s; writeConfig(rest); return { ok: true }; }
  if (password.length < 8) return { ok: false, error: 'Use at least 8 characters.' };
  const salt = crypto.randomBytes(16);
  writeConfig({ ...cfg, key: keyFrom(password, salt).toString('hex'), salt: salt.toString('hex') });
  return { ok: true };
}
export const backupSealed = () => !!readConfig().key;

/* ───────────────────── what a restore would change ───────────────────── */

export interface RestorePreview { rows: Array<{ label: string; now: number; backup: number }>; lastTradeNow: string | null; lastTradeBackup: string | null; newerTrades: number }
const PREVIEW: Array<[string, string]> = [
  ['Trades', 'SELECT count(*) n FROM trades WHERE deleted_at IS NULL'], ['Chart preps', 'SELECT count(*) n FROM session_prep'],
  ['Replay days', 'SELECT count(*) n FROM replay_days'], ['Daily reviews', 'SELECT count(*) n FROM daily_reviews'],
  ['Weekly reviews', 'SELECT count(*) n FROM weekly_reviews'], ['Journal pages', 'SELECT count(*) n FROM journal_pages'],
];

/** The journal now beside the backup, before anything is replaced: counts, the last trade, and the trades only here now. */
export function previewRestore(db: DatabaseSync, point: { source: 'local' | 'folder'; name: string; password?: string }):
  { ok: true; preview: RestorePreview } | { ok: false; error: string; needsPassword?: boolean } {
  const read = readPoint(point);
  if (!read.ok) return read;
  const bad = checkJournal(read.bytes);
  if (bad) return { ok: false, error: bad };
  const probe = path.join(BACKUPS_DIR, `.preview-${process.pid}-${Date.now()}.db`);
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  fs.writeFileSync(probe, read.bytes);
  try {
    const old = new DatabaseSync(probe, { readOnly: true });
    try {
      const count = (d: DatabaseSync, sql: string) => { try { return (d.prepare(sql).get() as { n: number }).n; } catch { return 0; } };
      const last = (d: DatabaseSync) => { try { return (d.prepare('SELECT max(date) d FROM trades WHERE deleted_at IS NULL').get() as { d: string | null }).d; } catch { return null; } };
      const ids = new Set((old.prepare('SELECT id FROM trades').all() as Array<{ id: string }>).map((r) => r.id));
      const newer = (db.prepare('SELECT id FROM trades WHERE deleted_at IS NULL').all() as Array<{ id: string }>).filter((r) => !ids.has(r.id)).length;
      return { ok: true, preview: {
        rows: PREVIEW.map(([label, sql]) => ({ label, now: count(db, sql), backup: count(old, sql) })),
        lastTradeNow: last(db), lastTradeBackup: last(old), newerTrades: newer,
      } };
    } finally { old.close(); }
  } finally { fs.rmSync(probe, { force: true }); }
}

/* ───────────────────── the journal's own health ───────────────────── */

const WEEK = 7 * 24 * 3600 * 1000;
/** SQLite's quick check on the open journal: weekly on its own, or now when asked. Never throws. */
export function checkIntegrity(db: DatabaseSync, force = false): { at: string; ok: boolean; detail: string } | null {
  const cfg = readConfig();
  if (!force && cfg.checkedAt && Date.now() - Date.parse(cfg.checkedAt) < WEEK) return null;
  try {
    const rows = db.prepare('PRAGMA quick_check').all() as Array<Record<string, string>>;
    const first = rows.map((r) => Object.values(r)[0]);
    const ok = first.length === 1 && first[0] === 'ok';
    const res = { at: new Date().toISOString(), ok, detail: ok ? 'ok' : first.slice(0, 5).join('; ') };
    writeConfig({ ...readConfig(), checkedAt: res.at, checkOk: res.ok, checkDetail: res.detail });
    return res;
  } catch (err) {
    const res = { at: new Date().toISOString(), ok: false, detail: err instanceof Error ? err.message : String(err) };
    writeConfig({ ...readConfig(), checkedAt: res.at, checkOk: false, checkDetail: res.detail });
    return res;
  }
}
