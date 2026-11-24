/*
  The journal's data version (migration 053) and the cache that reads it (db/dataVersion): every
  table the numbers read moves the version; app time and the engine's own ledger do not; a cached
  result is returned until the data changes, and never after.
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.SIGNATURE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'signature-dv-'));
process.env.SIGNATURE_MIGRATIONS_DIR = path.resolve('db/migrations');

const { getDb } = await import('../db/index');
const { dataVersion, cachedByData } = await import('../db/dataVersion');

const UNTRACKED = new Set(['app_time', 'insights', 'notifications', 'schema_migrations', 'sqlite_sequence', 'data_version']);

test('every table the numbers read has its three triggers — a table added (or rebuilt) later must get them', () => {
  const db = getDb();
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map((r) => r.name).filter((n) => !UNTRACKED.has(n));
  const triggers = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'dv_%'").all() as Array<{ name: string }>).map((r) => r.name));
  const missing = tables.flatMap((t) => ['insert', 'update', 'delete'].map((op) => `dv_${t}_${op}`)).filter((n) => !triggers.has(n));
  assert.deepEqual(missing, [], 'add these to a migration (see 053_data_version.sql)');
});

test('a write to the data moves the version; app time and the insight ledger do not', () => {
  const db = getDb();
  const v0 = dataVersion();
  db.prepare("INSERT INTO app_settings (key, value) VALUES ('dv-test', '1')").run();
  const v1 = dataVersion();
  assert.ok(v1 > v0, 'a setting is data');
  db.prepare("INSERT INTO app_time (day, seconds) VALUES ('2026-01-01', 5)").run();
  assert.equal(dataVersion(), v1, 'app time is not');
});

test('cachedByData: the same key on the same data is computed once; a change recomputes', () => {
  let runs = 0;
  const f = () => cachedByData('dv-test-key', () => { runs += 1; return { n: runs }; });
  assert.equal(f().n, 1); assert.equal(f().n, 1); assert.equal(runs, 1);
  getDb().prepare("UPDATE app_settings SET value = '2' WHERE key = 'dv-test'").run();
  assert.equal(f().n, 2, 'recomputed after a write');
  assert.throws(() => { (f() as { n: number }).n = 9; }, 'shared results are frozen in tests');
});

test('speed budget: Stats opened again on unchanged data is served from the cache (at least 5× faster than computing it)', async () => {
  const { createTrade } = await import('../db/trades');
  const { parseTradeInput } = await import('../lib/validate');
  const { boardPage } = await import('../db/statsBoard');
  for (let i = 0; i < 120; i++) {
    const r = parseTradeInput({ date: `2026-0${1 + (i % 9)}-1${i % 10}T09:45`, instrument: 'NQ', direction: i % 2 ? 'Long' : 'Short', session: 'NY AM', reason: 'Rules-based (A+ setup)',
      setup_type: 'iFVG', htf_bias: 'With bias', premium_discount: 'Premium', target_type: 'PDH/PDL', outcome: i % 3 ? 'Loss' : 'Win', r_multiple: i % 3 ? -1 : 2,
      account: i % 2 ? 'Demo' : 'Backtest (FX Replay)', explanation: 'E'.repeat(170), lesson: 'L'.repeat(170), screenshot_path: 'x.png', sweep_tier: 'major', singular_gap: true });
    if (r.ok) createTrade(r.value);
  }
  const time = (f: () => void) => { const t = performance.now(); f(); return performance.now() - t; };
  const first = time(() => boardPage({}));
  const again = time(() => boardPage({}));
  assert.ok(again * 5 < first, `computed ${first.toFixed(0)} ms, again ${again.toFixed(0)} ms`);
});
