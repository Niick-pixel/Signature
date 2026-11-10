/*
  The Backtest account: its own reason, no date needed, and never in a real
  total — through validation, the database (migration 019) and the stats.
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'signature-bt-'));
process.env.SIGNATURE_DATA_DIR = DIR;
process.env.SIGNATURE_MIGRATIONS_DIR = path.resolve('db/migrations');

const { getDb } = await import('../db/index');
const { createTrade, updateTrade, listTrades, getTrade } = await import('../db/trades');
const { parseTradeInput } = await import('../lib/validate');
const { forAccount, streaks, whenHeatmap, byMacroTime } = await import('../lib/stats');
const { BACKTEST, BACKTEST_REASON, ACCOUNTS, MONEY_ACCOUNTS, isReal, isDated } = await import('../lib/domain');
const { tradeDay } = await import('../lib/when');
const { journalExport } = await import('../lib/journalExport');

const input = (t: Record<string, unknown>, floor = {}) => {
  const r = parseTradeInput({
    date: '2026-09-20T09:41', instrument: 'NQ', direction: 'Long', session: 'NY AM', reason: 'Rules-based (A+ setup)',
    setup_type: 'iFVG', htf_bias: 'With bias', premium_discount: 'Discount', target_type: 'Opposing FVG',
    outcome: 'Win', r_multiple: 2, account: 'Live', explanation: 'E'.repeat(170), lesson: 'L'.repeat(170),
    screenshot_path: 'x.png', chk_returned_to_fvg: true, chk_inversion_close: true, ...t,
  }, floor);
  return r;
};

test('Backtest is offered again, and is no money account and not real', () => {
  assert.ok(ACCOUNTS.includes(BACKTEST));
  assert.ok(!MONEY_ACCOUNTS.includes(BACKTEST));
  assert.equal(isReal(BACKTEST), false);
  assert.equal(isReal('Missed'), false);
  assert.equal(isReal('Live'), true);
});

test('a backtest can be saved with no date at all', () => {
  const r = input({ account: BACKTEST, undated: true, date: undefined, reason: BACKTEST_REASON });
  assert.ok(r.ok, !r.ok ? r.error : '');
  if (!r.ok) return;
  assert.equal(r.value.undated, true);
  assert.ok(!Number.isNaN(Date.parse(r.value.date)), 'the date holds when it was logged');
});

test('only a backtest can be undated; any other account keeps its date', () => {
  const r = input({ account: 'Live', undated: true });
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.value.undated, false);
  const noDate = input({ account: 'Live', undated: true, date: undefined });
  assert.equal(noDate.ok, false, 'a real trade with no date is still asked for one');
});

test('editing an undated backtest without a date keeps its place in the order', () => {
  const r = input({ account: BACKTEST, undated: true, date: undefined, reason: BACKTEST_REASON },
    { previous: { explanation: '', lesson: null, date: '2026-01-05T10:00:00.000Z' } });
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.value.date, '2026-01-05T10:00:00.000Z');
});

test('migration 019: the backtest reason and undated round-trip through the database', () => {
  getDb();
  const ok = input({ account: BACKTEST, undated: true, reason: BACKTEST_REASON });
  assert.ok(ok.ok);
  if (!ok.ok) return;
  const saved = createTrade(ok.value);
  const back = listTrades().find((t) => t.id === saved.id)!;
  assert.equal(back.undated, true);
  assert.equal(back.reason, BACKTEST_REASON);
  assert.equal(back.account, BACKTEST);
  // Adding a date later is an ordinary edit.
  const dated = input({ account: BACKTEST, undated: false, date: '2025-11-03T09:50', reason: BACKTEST_REASON });
  assert.ok(dated.ok);
  if (dated.ok) updateTrade(saved.id, dated.value);
  const again = listTrades().find((t) => t.id === saved.id)!;
  assert.equal(again.undated, false);
  assert.equal(again.date.slice(0, 10), '2025-11-03');
});

test('the schema refuses an unknown reason and a non-boolean undated', () => {
  const db = getDb();
  const id = listTrades()[0].id;
  assert.throws(() => db.prepare("UPDATE trades SET reason = 'Nonsense' WHERE id = ?").run(id));
  assert.throws(() => db.prepare('UPDATE trades SET undated = 2 WHERE id = ?').run(id));
});

// Stats, on plain objects.
const t = (over: Record<string, unknown>) => ({
  id: Math.random().toString(36).slice(2), date: '2026-09-21T14:40:00', undated: false, account: 'Live',
  outcome: 'Win', r_multiple: 1, macro_time: true, followed_rules: true, deleted_at: null, ...over,
}) as never;

test('All never includes a backtest (or a missed trade)', () => {
  const trades = [t({ account: 'Live' }), t({ account: BACKTEST }), t({ account: 'Missed' }), t({ account: 'Demo' })];
  assert.deepEqual(forAccount(trades, 'All').map((x: { account: string }) => x.account).sort(), ['Demo', 'Live']);
  assert.equal(forAccount(trades, BACKTEST).length, 1);
});

test('undated backtests sit out of everything that asks when', () => {
  const undated = t({ account: BACKTEST, undated: true, date: new Date().toISOString() });
  const dated = t({ account: BACKTEST, date: '2025-11-03T09:50:00' });
  assert.equal(isDated(undated), false);
  assert.equal(whenHeatmap([undated]).length, 0, 'no weekday or hour');
  assert.equal(whenHeatmap([dated]).length, 1);
  assert.equal(streaks([undated]).journalingBest, 0, 'not a journaling day');
  const macro = byMacroTime([undated]);
  assert.equal(macro.reduce((n, g) => n + g.trades.length, 0), 0, 'neither inside nor outside the macro');
  assert.equal(tradeDay(undated), 'Undated');
});

test('the journal export leaves backtests out — they are not days lived', () => {
  const today = new Date().toISOString().slice(0, 10);
  const bt = { ...(t({ account: BACKTEST, date: `${today}T10:00:00` }) as object), instrument: 'NQ', direction: 'Long',
    setup_type: 'iFVG', grade_letter: 'A', reason: BACKTEST_REASON, mistake_tags: [], worked_tags: [], lesson: '' };
  const out = journalExport({ range: '30', pages: [], trades: [bt as never], reviews: [], preps: [] });
  assert.equal(out.days, 0);
  assert.ok(!out.markdown.includes(BACKTEST_REASON));
});

test('migration 042: the drill answer round-trips; an unknown answer reads as unanswered, never blocks', () => {
  getDb();
  const ok = input({ account: BACKTEST, undated: true, reason: BACKTEST_REASON, drill_key: 'theme:early', drill_kept: 'kept' });
  assert.ok(ok.ok);
  if (!ok.ok) return;
  const back = getTrade(createTrade(ok.value).id)!;
  assert.equal(back.drill_key, 'theme:early');
  assert.equal(back.drill_kept, 'kept');
  const empty = input({ account: BACKTEST, undated: true, reason: BACKTEST_REASON });
  assert.ok(empty.ok && empty.value.drill_kept == null, 'empty by default');
  const odd = input({ account: BACKTEST, undated: true, reason: BACKTEST_REASON, drill_kept: 'mostly' });
  assert.ok(odd.ok && odd.value.drill_kept === null);
});
