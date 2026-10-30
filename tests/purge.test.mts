/*
  Purge is the one real delete. It must take everything that belongs only to
  the trade — child rows and chart files — and nothing another trade still
  uses.
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'signature-purge-'));
process.env.SIGNATURE_DATA_DIR = DIR;
process.env.SIGNATURE_MIGRATIONS_DIR = path.resolve('db/migrations');

const { getDb } = await import('../db/index');
const { createTrade, purgeTrade, dismissFlag } = await import('../db/trades');
const { addShot } = await import('../db/shots');
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
const file = (rel: string) => path.join(DIR, 'screenshots', rel);
const put = (rel: string) => { fs.mkdirSync(path.dirname(file(rel)), { recursive: true }); fs.writeFileSync(file(rel), 'x'); };
const count = (sql: string, ...args: string[]) => (getDb().prepare(sql).get(...args) as { n: number }).n;

test('purge removes every child row and its own chart files', () => {
  const db = getDb();
  put('a/main.png'); put('a/result.png');
  const t = trade('a/main.png');
  addShot(t.id, 'a/main.png', 'Entry');
  addShot(t.id, 'a/result.png', 'Result');
  dismissFlag(t.id, 'settled_without_risk', 'x');
  db.prepare("INSERT INTO trade_partials (id, trade_id, size, r, ordinal) VALUES ('p', ?, 1, 1, 0)").run(t.id);
  db.prepare("INSERT INTO shot_drawings (path, data) VALUES ('a/result.png', '[]')").run();
  db.prepare("INSERT INTO board_edges (id, from_id, to_id) VALUES ('e', ?, 'note')").run(t.id);
  db.prepare("INSERT INTO predictions (id, trade_id, model, n) VALUES ('pr', ?, 'm', 1)").run(t.id);

  assert.equal(purgeTrade(t.id), true);
  for (const tbl of ['trade_screenshots', 'trade_partials', 'flag_dismissals', 'predictions', 'trade_edits', 'trade_custom_tags', 'blind_grades', 'trade_bars']) {
    assert.equal(count(`SELECT COUNT(*) n FROM ${tbl} WHERE trade_id = ?`, t.id), 0, tbl);
  }
  assert.equal(count('SELECT COUNT(*) n FROM board_edges WHERE from_id = ? OR to_id = ?', t.id, t.id), 0);
  assert.equal(count("SELECT COUNT(*) n FROM shot_drawings WHERE path = 'a/result.png'"), 0);
  assert.equal(fs.existsSync(file('a/main.png')), false);
  assert.equal(fs.existsSync(file('a/result.png')), false);
});

test('purge never deletes a chart another trade still shows', () => {
  put('b/shared.png'); put('b/gallery.png');
  const a = trade('b/shared.png');
  const b = trade('b/other.png');
  addShot(a.id, 'b/gallery.png', 'Result');
  addShot(b.id, 'b/gallery.png', 'Result'); // a duplicate's gallery points at the same file
  const c = trade('b/shared.png');

  purgeTrade(a.id);
  assert.equal(fs.existsSync(file('b/shared.png')), true, 'c still uses it as its main chart');
  assert.equal(fs.existsSync(file('b/gallery.png')), true, "b still shows it in its gallery");
  assert.ok(c.id);
});

test('removing a gallery chart keeps a file another trade uses as its main chart', async () => {
  const { removeShot } = await import('../db/shots');
  put('c/both.png');
  const a = trade('c/a.png');
  trade('c/both.png');
  const shot = addShot(a.id, 'c/both.png', 'Result');
  removeShot(shot.id);
  assert.equal(fs.existsSync(file('c/both.png')), true);
});
