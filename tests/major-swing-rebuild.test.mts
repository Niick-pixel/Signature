/* 050: "Major swing H/L" as a target type — the trades rebuild keeps every row and everything pointing at it; the rollback too. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// A journal at 049: the migrations up to it, 050 held back until the rows exist.
const migrations = fs.mkdtempSync(path.join(os.tmpdir(), 'signature-050-mig-'));
for (const f of fs.readdirSync('db/migrations')) if (f < '050') fs.copyFileSync(path.join('db/migrations', f), path.join(migrations, f));
process.env.SIGNATURE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'signature-050-'));
process.env.SIGNATURE_MIGRATIONS_DIR = migrations;

const { getDb } = await import('../db/index');
const { migrate } = await import('../db/migrate');
const { createTrade, getTrade } = await import('../db/trades');
const { rollback } = await import('../db/cli-rollback');
const { parseTradeInput } = await import('../lib/validate');

const base = {
  date: '2026-11-03T09:50', instrument: 'NQ', direction: 'Long', session: 'NY AM', reason: 'Rules-based (A+ setup)', setup_type: 'iFVG',
  htf_bias: 'With bias', premium_discount: 'Discount', target_type: 'PDH/PDL', outcome: 'Win', r_multiple: 2, account: 'Demo', status: 'Settled',
  explanation: 'x'.repeat(200), lesson: 'y'.repeat(200), screenshot_path: 'a.png',
};
const objects = (db: ReturnType<typeof getDb>) => (db.prepare("SELECT type || ':' || name AS n FROM sqlite_master WHERE tbl_name = 'trades' AND name NOT LIKE 'sqlite_%' ORDER BY n").all() as Array<{ n: string }>).map((r) => r.n);
const counts = (db: ReturnType<typeof getDb>) => ['trades', 'executions', 'execution_unlinks', 'trade_bars', 'study_note_trades', 'trade_edits']
  .map((t) => (db.prepare(`SELECT count(*) AS n FROM ${t}`).get() as { n: number }).n);

test('050 rebuilds trades with Major swing H/L allowed; executions, bars, study links and edits all survive; the rollback too', () => {
  const db = getDb();
  const r = parseTradeInput(base);
  if (!r.ok) throw new Error(r.error);
  const t = createTrade(r.value);
  // Everything that points at the trade, with ON DELETE CASCADE or SET NULL.
  db.prepare(`INSERT INTO executions (id, fingerprint, platform, symbol, instrument, direction, qty, entry_price, exit_price, entry_at, exit_at, trade_id)
    VALUES ('e1', 'fp1', 'test', 'NQ', 'NQ', 'Long', 1, 100, 110, '2026-11-03T09:50', '2026-11-03T10:10', ?)`).run(t.id);
  db.prepare("INSERT INTO executions (id, fingerprint, platform, symbol, instrument, direction, qty, entry_price, exit_price, entry_at, exit_at) VALUES ('e2', 'fp2', 'test', 'NQ', 'NQ', 'Long', 1, 1, 2, 'a', 'b')").run();
  db.prepare('INSERT INTO execution_unlinks (execution_id, trade_id) VALUES (?, ?)').run('e2', t.id);
  db.prepare("INSERT INTO trade_bars (trade_id, bars) VALUES (?, '[]')").run(t.id);
  db.prepare("INSERT INTO study_notes (id, title, body) VALUES ('n1', 'Note', 'Body')").run();
  db.prepare("INSERT INTO study_note_trades (note_id, trade_id) VALUES ('n1', ?)").run(t.id);
  db.prepare("INSERT INTO trade_edits (trade_id, field, old_value, new_value) VALUES (?, 'lesson', 'a', 'b')").run(t.id);
  assert.throws(() => db.prepare("UPDATE trades SET target_type = 'Major swing H/L' WHERE id = ?").run(t.id), /CHECK/, 'not allowed before 050');
  const before = { counts: counts(db), objects: objects(db), trade: getTrade(t.id) };

  fs.copyFileSync('db/migrations/050_major_swing_target.sql', path.join(migrations, '050_major_swing_target.sql'));
  migrate(db);
  assert.deepEqual(counts(db), before.counts, 'every row kept, nothing cascaded');
  assert.equal((db.prepare("SELECT trade_id FROM executions WHERE id = 'e1'").get() as { trade_id: string }).trade_id, t.id, 'the link, not set null');
  assert.deepEqual(objects(db), before.objects, 'the same indexes and triggers');
  assert.deepEqual(getTrade(t.id), before.trade, 'the trade reads back the same');
  assert.equal((db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }).foreign_keys, 1, 'foreign keys back on');
  db.prepare("UPDATE trades SET target_type = 'Major swing H/L' WHERE id = ?").run(t.id);
  assert.equal(getTrade(t.id)!.target_type, 'Major swing H/L');
  // The locks still hold after the rebuild.
  assert.throws(() => db.prepare("UPDATE trades SET status = 'Planned' WHERE id = ?").run(t.id), /cannot go back/);

  rollback('050', db);
  assert.deepEqual(counts(db).slice(1, 5), before.counts.slice(1, 5), 'linked rows kept through the rollback');
  assert.equal(getTrade(t.id)!.target_type, 'Other', 'a major swing target becomes Other');
  assert.throws(() => db.prepare("UPDATE trades SET target_type = 'Major swing H/L' WHERE id = ?").run(t.id), /CHECK/);
  assert.deepEqual(objects(db), before.objects);
});
