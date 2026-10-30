/*
  The export is the backup, so it must carry every table — not just the ones
  someone remembered. This compares the whole journal, table by table (listed
  from sqlite_master, so a table added later is covered without touching this
  file), across export (.zip) → wipe → import, charts included.
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'signature-rtfull-'));
process.env.SIGNATURE_DATA_DIR = DIR;
process.env.SIGNATURE_MIGRATIONS_DIR = path.resolve('db/migrations');

const { getDb } = await import('../db/index');
const { createTrade, dismissFlag } = await import('../db/trades');
const { addShot } = await import('../db/shots');
const { setFocus } = await import('../db/review');
const { parseTradeInput } = await import('../lib/validate');
const exportRoute = await import('../app/api/export/route');
const importRoute = await import('../app/api/import/route');

// Rows a restore rebuilds by design, or that are not journal content.
const SKIP = new Set(['schema_migrations', 'sqlite_sequence']);
// Columns a restore legitimately rewrites.
const VOLATILE = new Set(['updated_at']);

function snapshot(): Record<string, string[]> {
  const db = getDb();
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>)
    .map((r) => r.name).filter((n) => !SKIP.has(n)).sort();
  return Object.fromEntries(tables.map((t) => [t, (db.prepare(`SELECT * FROM ${t}`).all() as Record<string, unknown>[])
    .map((r) => JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k]) => !VOLATILE.has(k)).sort())))
    .sort()]));
}

const trade = (t: Record<string, unknown>) => {
  const r = parseTradeInput({
    date: '2026-09-20T09:41', instrument: 'NQ', direction: 'Long', session: 'NY AM', reason: 'Rules-based (A+ setup)',
    setup_type: 'iFVG', htf_bias: 'With bias', premium_discount: 'Discount', target_type: 'PDH/PDL',
    outcome: 'Win', r_multiple: 2.1, account: 'Live', explanation: 'E'.repeat(170), lesson: 'L'.repeat(170),
    screenshot_path: '2026-09/main.png', ...t,
  });
  if (!r.ok) throw new Error(r.error);
  return createTrade(r.value);
};

test('export .zip → wipe → import: every table and every chart comes back', async () => {
  const db = getDb();
  const shots = path.join(DIR, 'screenshots', '2026-09');
  fs.mkdirSync(shots, { recursive: true });
  fs.writeFileSync(path.join(shots, 'main.png'), Buffer.from('main-chart'));
  fs.writeFileSync(path.join(shots, 'result.png'), Buffer.from('result-chart'));

  const a = trade({});
  addShot(a.id, '2026-09/main.png', 'Entry');
  addShot(a.id, '2026-09/result.png', 'Result');
  dismissFlag(a.id, 'settled_without_risk', 'Paper trade');
  setFocus('2026-09-14', 'max_trades');
  db.prepare("UPDATE app_settings SET value = '3' WHERE key = 'max_trades_per_day'").run();
  db.prepare("INSERT INTO board_notes (id, body, x, y) VALUES ('n1', 'Wait for the close', 10, 20)").run();
  db.prepare("INSERT INTO board_edges (id, from_id, to_id, label) VALUES ('e1', ?, 'n1', 'see')").run(a.id);
  db.prepare("INSERT INTO trade_partials (id, trade_id, size, r, ordinal) VALUES ('p1', ?, 1, 1.5, 0)").run(a.id);
  db.prepare("INSERT INTO trade_edits (trade_id, field, old_value, new_value) VALUES (?, 'lesson', 'a', 'b')").run(a.id);
  db.prepare("INSERT INTO playbooks (id, name, criteria) VALUES ('pb1', 'iFVG', 'sweep, gap, close')").run();

  const before = snapshot();
  for (const t of ['trade_screenshots', 'board_notes', 'board_edges', 'trade_partials', 'trade_edits', 'playbooks', 'flag_dismissals']) {
    assert.ok(before[t].length > 0, `${t} has a row to lose`);
  }

  const zip = Buffer.from(await (await exportRoute.GET()).arrayBuffer());

  (globalThis as { __signatureDb?: { close(): void } }).__signatureDb?.close();
  delete (globalThis as { __signatureDb?: unknown }).__signatureDb;
  fs.rmSync(DIR, { recursive: true, force: true });
  fs.mkdirSync(DIR, { recursive: true });

  const res = await importRoute.POST(new Request('http://local/api/import', { method: 'POST', body: zip }));
  assert.equal(res.status, 200);
  const out = await res.json();
  assert.equal(out.imported, 1, JSON.stringify(out.rejected));
  assert.equal(out.charts, 2);

  const after = snapshot();
  const diff = Object.keys(before).flatMap((t) => (JSON.stringify(before[t]) === JSON.stringify(after[t]) ? [] : [`${t}: ${before[t].length} → ${after[t]?.length ?? 0}`]));
  assert.deepEqual(diff, []);
  assert.equal(fs.readFileSync(path.join(shots, 'result.png'), 'utf8'), 'result-chart');

  // Importing the same file again changes nothing — and never overwrites a chart.
  fs.writeFileSync(path.join(shots, 'result.png'), Buffer.from('edited-since'));
  const again = await (await importRoute.POST(new Request('http://local/api/import', { method: 'POST', body: zip }))).json();
  assert.equal(again.imported, 0);
  assert.equal(again.charts, 0);
  assert.deepEqual(snapshot(), after);
  assert.equal(fs.readFileSync(path.join(shots, 'result.png'), 'utf8'), 'edited-since');
});
