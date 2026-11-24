/*
  Backups you can trust: a second folder with a daily zip (journal + charts),
  and Restore from inside the app — tested end to end, restore included.
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'signature-safe-'));
const ELSEWHERE = fs.mkdtempSync(path.join(os.tmpdir(), 'signature-elsewhere-'));
process.env.SIGNATURE_DATA_DIR = DIR;
process.env.SIGNATURE_MIGRATIONS_DIR = path.resolve('db/migrations');

const { getDb, closeDb } = await import('../db/index');
const { createTrade, listTrades } = await import('../db/trades');
const { backupNow } = await import('../db/backup');
const safe = await import('../db/safeBackup');
const { readZip } = await import('../lib/unzip');
const { parseTradeInput } = await import('../lib/validate');

const trade = (shot: string) => {
  const r = parseTradeInput({
    date: '2026-09-20T09:41', instrument: 'NQ', direction: 'Long', session: 'NY AM', reason: 'Rules-based (A+ setup)',
    setup_type: 'iFVG', htf_bias: 'With bias', premium_discount: 'Discount', target_type: 'PDH/PDL',
    outcome: 'Win', r_multiple: 2, account: 'Live', explanation: 'E'.repeat(170), lesson: 'L'.repeat(170), screenshot_path: shot,
  });
  if (!r.ok) throw new Error(r.error);
  return createTrade(r.value);
};
const shot = (rel: string, body: string) => {
  const f = path.join(DIR, 'screenshots', rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body);
};

test('the second folder must be outside the journal and writable', () => {
  getDb();
  assert.equal(safe.setBackupFolder(path.join(DIR, 'backups')).ok, false);
  assert.equal(safe.setBackupFolder(DIR).ok, false);
  assert.equal(safe.setBackupFolder('relative/folder').ok, false);
  assert.equal(safe.setBackupFolder(ELSEWHERE).ok, true);
  assert.equal(safe.backupFolder().folder, path.resolve(ELSEWHERE));
});

test('a daily zip with the journal and every chart; once a day; newest 14 kept', () => {
  shot('2026-09/a.png', 'chart-a');
  trade('2026-09/a.png');
  const file = safe.folderBackup(getDb());
  assert.ok(file && fs.existsSync(file));
  const files = readZip(fs.readFileSync(file!));
  assert.ok(files.get('journal.db')!.subarray(0, 15).toString() === 'SQLite format 3');
  assert.equal(files.get('screenshots/2026-09/a.png')!.toString(), 'chart-a');
  assert.equal(safe.folderBackup(getDb()), null, 'today already has one');
  for (let i = 1; i <= 20; i++) fs.writeFileSync(path.join(ELSEWHERE, `Signature-backup-2025-01-${String(i).padStart(2, '0')}.zip`), 'old');
  safe.folderBackup(getDb(), true);
  assert.equal(fs.readdirSync(ELSEWHERE).filter((f) => f.endsWith('.zip')).length, 14);
});

test('restore from a local copy: the journal goes back, a safety copy of now is kept', () => {
  const before = listTrades().length;
  const local = path.basename(backupNow(getDb()));
  trade('2026-09/a.png');
  assert.equal(listTrades().length, before + 1);
  const r = safe.restoreBackup(getDb(), closeDb, { source: 'local', name: local });
  assert.equal(r.ok, true);
  assert.equal(listTrades().length, before, 'back to the backup');
  // The safety copy holds the state that was replaced.
  const safety = r.ok ? r.safety : '';
  assert.ok(safe.restorePoints().some((p) => p.name === safety));
});

test('restore from a folder zip puts its charts back, never over a file that is there', () => {
  const zip = safe.restorePoints().find((p) => p.source === 'folder' && p.name.includes(new Date().getFullYear().toString()))!;
  fs.rmSync(path.join(DIR, 'screenshots', '2026-09', 'a.png'));
  shot('2026-09/keep.png', 'mine');
  const r = safe.restoreBackup(getDb(), closeDb, { source: 'folder', name: zip.name });
  assert.equal(r.ok, true);
  assert.equal(fs.readFileSync(path.join(DIR, 'screenshots', '2026-09', 'a.png'), 'utf8'), 'chart-a');
  assert.equal(fs.readFileSync(path.join(DIR, 'screenshots', '2026-09', 'keep.png'), 'utf8'), 'mine');
  assert.ok(listTrades().length >= 1);
});

test('a damaged or foreign file is refused and nothing is touched', () => {
  const n = listTrades().length;
  fs.writeFileSync(path.join(ELSEWHERE, 'Signature-backup-2099-01-01.zip'), 'not a zip');
  const r = safe.restoreBackup(getDb(), closeDb, { source: 'folder', name: 'Signature-backup-2099-01-01.zip' });
  assert.equal(r.ok, false);
  assert.equal(safe.restoreBackup(getDb(), closeDb, { source: 'local', name: '../journal.db' }).ok, false);
  assert.equal(listTrades().length, n);
});

test('a password seals the second copy: opened here with the saved key, elsewhere only with the password', () => {
  assert.equal(safe.setBackupPassword('short').ok, false, 'at least 8 characters');
  assert.equal(safe.setBackupPassword('correct horse battery').ok, true);
  const file = safe.folderBackup(getDb(), true)!;
  assert.ok(file.endsWith('.zip.enc'), file);
  const raw = fs.readFileSync(file);
  assert.equal(raw.subarray(0, 8).toString('latin1'), 'SIGENC1\n', 'sealed, not a readable zip');
  assert.throws(() => readZip(raw));
  const point = { source: 'folder' as const, name: path.basename(file) };
  // On this computer: the saved key opens it.
  const here = safe.previewRestore(getDb(), point);
  assert.equal(here.ok, true);
  // Another computer: no key saved — the password is asked for, a wrong one refused, the right one opens it.
  const cfgFile = path.join(DIR, 'backup-folder.json');
  const saved = fs.readFileSync(cfgFile, 'utf8');
  fs.writeFileSync(cfgFile, JSON.stringify({ folder: ELSEWHERE }));
  const asked = safe.previewRestore(getDb(), point);
  assert.ok(!asked.ok && asked.needsPassword);
  const wrong = safe.previewRestore(getDb(), { ...point, password: 'not the password' });
  assert.ok(!wrong.ok && /Wrong password/.test(wrong.error));
  assert.equal(safe.previewRestore(getDb(), { ...point, password: 'correct horse battery' }).ok, true);
  fs.writeFileSync(cfgFile, saved);
  assert.equal(safe.setBackupPassword(null).ok, true);
  assert.equal(safe.backupSealed(), false);
});

test('the restore preview: counts now beside the backup, and the trades logged since', () => {
  const before = safe.restorePoints().find((p) => p.source === 'local')!;
  trade('2026-09/b.png'); trade('2026-09/c.png');
  const r = safe.previewRestore(getDb(), { source: 'local', name: before.name });
  assert.ok(r.ok);
  const row = r.preview.rows.find((x) => x.label === 'Trades')!;
  assert.ok(row.now >= row.backup + 2, JSON.stringify(row));
  assert.ok(r.preview.newerTrades >= 2);
});

test('the journal check: sound now, recorded, and not re-run within the week unless asked', () => {
  const first = safe.checkIntegrity(getDb(), true)!;
  assert.equal(first.ok, true);
  assert.equal(safe.checkIntegrity(getDb()), null, 'checked this week already');
  assert.ok(safe.backupFolder().checkedAt);
});
