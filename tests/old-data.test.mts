/*
  Old trades must load and export exactly as before.

  1. A journal at the schema before the Path (migrations 001–023) is filled,
     then brought up to date: every trade and cash row reads back identical,
     column for column (the only difference is the new, empty overrides).
  2. A version-5 export — no overrides, no Path — still imports, and its
     trades come back as they were.
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'signature-old-'));
const MIG = fs.mkdtempSync(path.join(os.tmpdir(), 'signature-old-mig-'));
const ALL = fs.readdirSync('db/migrations').filter((f) => f.endsWith('.sql')).sort();
const BEFORE_PATH = ALL.filter((f) => f < '024');
for (const f of BEFORE_PATH) fs.copyFileSync(path.join('db/migrations', f), path.join(MIG, f));
process.env.SIGNATURE_DATA_DIR = DIR;
process.env.SIGNATURE_MIGRATIONS_DIR = MIG;

const { DatabaseSync } = await import('node:sqlite');
const { migrate } = await import('../db/migrate');

const db = new DatabaseSync(path.join(DIR, 'journal.db'));
migrate(db);

test('a pre-Path journal comes through every later migration unchanged', () => {
  const ins = db.prepare(`INSERT INTO trades (id, date, instrument, direction, session, reason, setup_type, htf_bias,
    premium_discount, target_type, outcome, r_multiple, explanation, account, status, graded_post_hoc, market_tags, worked_tags, mistake_tags,
    sweep_tier, chk_sweep, singular_gap, chk_returned_to_fvg, chk_inversion_close, rubric_version, score_at_entry, letter_at_entry, trigger_fired_at_entry, grade_at_entry)
    VALUES (?, ?, 'NQ', ?, 'NY AM', 'Rules-based (A+ setup)', 'iFVG', 'With bias', 'Premium', ?, ?, ?, 'old trade', ?, 'Settled', 1, ?, '[]', ?,
    'major', 1, 1, 1, 1, 3, 85, 'B', 1, 85)`);
  const accounts = ['Demo', 'Live', 'Funded', 'Backtest (FX Replay)', 'Missed'];
  for (let i = 0; i < 40; i++) {
    ins.run(crypto.randomUUID(), `2026-09-${String(1 + (i % 28)).padStart(2, '0')}T09:${String(10 + i).padStart(2, '0')}`,
      i % 2 ? 'Long' : 'Short', i % 3 ? 'PDH/PDL' : 'EQH/EQL', i % 4 ? 'Win' : 'Loss', i % 4 ? 2 : -1,
      accounts[i % accounts.length], i % 5 ? '[]' : '["Liquidity grab"]', i % 6 ? '[]' : '["Chased"]');
  }
  db.prepare("INSERT INTO cash_events (id, account, kind, amount, date) VALUES (?, 'Funded', 'deposit', 500, '2026-09-01')").run(crypto.randomUUID());

  const oldCols = (db.prepare('PRAGMA table_xinfo(trades)').all() as Array<{ name: string }>).map((c) => c.name);
  const snapshot = () => JSON.stringify({
    trades: (db.prepare('SELECT * FROM trades ORDER BY id').all() as Record<string, unknown>[])
      .map((r) => Object.fromEntries(oldCols.map((c) => [c, r[c]]))),
    cash: db.prepare('SELECT * FROM cash_events ORDER BY id').all(),
  });
  const before = snapshot();

  for (const f of ALL.filter((x) => !BEFORE_PATH.includes(x))) fs.copyFileSync(path.join('db/migrations', f), path.join(MIG, f));
  migrate(db);

  assert.equal(snapshot(), before);
  // Every column added since is empty on every old trade.
  const added = (db.prepare('PRAGMA table_xinfo(trades)').all() as Array<{ name: string }>).map((c) => c.name).filter((c) => !oldCols.includes(c));
  assert.ok(added.includes('overrides') && added.includes('grade_locked_at'), added.join(','));
  for (const c of added) assert.equal((db.prepare(`SELECT count(*) n FROM trades WHERE ${c} IS NOT NULL`).get() as { n: number }).n, 0, c);
  // Every index and trigger came across the rebuild.
  const objs = (db.prepare("SELECT name FROM sqlite_master WHERE tbl_name='trades' AND type IN ('index','trigger') AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>).map((r) => r.name).sort();
  assert.deepEqual(objs, [
    'idx_trades_account', 'idx_trades_date', 'idx_trades_deleted', 'idx_trades_grade', 'idx_trades_outcome', 'idx_trades_playbook',
    'idx_trades_reason', 'idx_trades_status', 'idx_trades_sweep_tier', 'idx_trades_target_type',
    'trades_grade_at_entry_locked', 'trades_loss_negative_insert', 'trades_loss_negative_update', 'trades_no_return_to_planned', 'trades_touch_updated_at',
  ]);
  // And Eval is now a legal account, in trades and in cash.
  db.prepare("UPDATE trades SET account = 'Eval' WHERE rowid = (SELECT min(rowid) FROM trades)").run();
  db.prepare("INSERT INTO cash_events (id, account, kind, amount, date) VALUES (?, 'Eval', 'deposit', 1, '2026-09-02')").run(crypto.randomUUID());
});

test('a version-5 export imports, and its trades come back as they were', async () => {
  db.close();
  const { listTrades } = await import('../db/trades');
  const exportRoute = await import('../app/api/export/route');
  const importRoute = await import('../app/api/import/route');
  const { getDb } = await import('../db/index');
  const { inflateRawSync } = await import('node:zlib');

  const res = await exportRoute.GET();
  const buf = Buffer.from(await res.arrayBuffer());
  // trades.json out of the zip
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let at = buf.readUInt32LE(eocd + 16);
  let json: Record<string, unknown> | null = null;
  for (let i = 0; i < buf.readUInt16LE(eocd + 10); i++) {
    const nameLen = buf.readUInt16LE(at + 28);
    const name = buf.subarray(at + 46, at + 46 + nameLen).toString('utf8');
    if (name === 'trades.json') {
      const local = buf.readUInt32LE(at + 42);
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const body = buf.subarray(start, start + buf.readUInt32LE(at + 20));
      json = JSON.parse((buf.readUInt16LE(at + 10) === 8 ? inflateRawSync(body) : body).toString('utf8'));
    }
    at += 46 + nameLen + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32);
  }
  assert.ok(json);
  const original = listTrades();

  // Make it a version-5 file: no overrides on trades, no Path.
  const v5 = { ...json, version: 5 } as Record<string, unknown>;
  delete v5.path_steps; delete v5.path_events; delete v5.eval_purchases;
  v5.trades = (json.trades as Record<string, unknown>[]).map(({ overrides: _o, ...t }) => t);

  getDb().exec('DELETE FROM trades; DELETE FROM cash_events;');
  const imported = await importRoute.POST(new Request('http://x/api/import', { method: 'POST', body: JSON.stringify(v5) }));
  assert.equal(imported.status, 200, await imported.clone().text());
  const back = listTrades();
  const strip = (ts: typeof original) => ts.map(({ updated_at: _u, ...t }) => t).sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(strip(back), strip(original));
  // The path was left as it was: a v5 file carries none.
  assert.equal((getDb().prepare('SELECT count(*) n FROM path_steps').get() as { n: number }).n, 6);
});
