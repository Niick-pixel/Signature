/* Reports: compare, breakdowns, fees, tags — and your own tag groups in the database. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.SIGNATURE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'signature-reports-'));
process.env.SIGNATURE_MIGRATIONS_DIR = path.resolve('db/migrations');

const R = await import('../lib/reports');
const T = await import('../db/tags');
const tagsRoute = await import('../app/api/tags/route');

let n = 0;
const row = (day: string, r: number, o: Partial<import('../lib/reports').ReportRow> = {}) => {
  n += 1;
  return { id: `r${n}`, day, account: 'Topstep 50K', world: 'real', setup: 'iFVG', session: 'NY AM', direction: 'Long', grade: 'A', outcome: r > 0 ? 'Win' : r < 0 ? 'Loss' : 'Breakeven',
    instrument: 'NQ', r, money: r * 100, fees: 5, gross: r * 100 + 5, contracts: 1, holdMin: 4, nyMin: 580, weekday: (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7,
    mistakes: [], tags: [], maeR: null, mfeR: null, confidence: 4, ...o } as import('../lib/reports').ReportRow;
};

test('filters: clean vs tagged, weekdays, dates, own tags (all must match)', () => {
  const rows = [row('2026-10-05', 2), row('2026-10-06', -1, { mistakes: ['Chased'] }), row('2026-10-09', 1, { tags: ['a', 'b'] }), row('2026-10-12', -1, { world: 'backtest' })];
  assert.equal(R.applyFilter(rows, { clean: true }).length, 3);
  assert.equal(R.applyFilter(rows, { tagged: true }).length, 1);
  assert.equal(R.applyFilter(rows, { weekdays: [0] }).length, 2, 'two Mondays');
  assert.equal(R.applyFilter(rows, { from: '2026-10-06', to: '2026-10-09' }).length, 2);
  assert.equal(R.applyFilter(rows, { tags: ['a', 'b'] }).length, 1);
  assert.equal(R.applyFilter(rows, { tags: ['a', 'z'] }).length, 0);
  assert.equal(R.applyFilter(rows, { world: 'real' }).length, 3);
});

test('summary: win rate, profit factor, drawdown, curve, fees, hold', () => {
  const s = R.summary([row('2026-10-01', 2), row('2026-10-02', -1), row('2026-10-03', -1), row('2026-10-04', 3)]);
  assert.deepEqual([s.n, s.winRate, s.netR, s.profitFactor, s.maxDD, s.fees, s.avgHold], [4, 0.5, 3, 2.5, -2, 20, 4]);
  assert.deepEqual(s.curve, [2, 1, 0, 3]);
});

test('breakdowns: holding time and the NY open in buckets, in order; winners against losers', () => {
  const rows = [row('2026-10-05', 2, { holdMin: 1, nyMin: 575 }), row('2026-10-05', -1, { holdMin: 20, nyMin: 620, contracts: 3 }), row('2026-10-06', 1, { holdMin: 3, nyMin: 590 })];
  const b = R.breakdowns(rows);
  const hold = b.find((x) => x.id === 'hold')!;
  assert.deepEqual(hold.rows.map((r) => r.label), ['Under 2 min', '2–5 min', '15–60 min']);
  const open = b.find((x) => x.id === 'open')!;
  assert.deepEqual(open.rows.map((r) => r.label), ['9:30–9:45', '9:45–10:00', '10:00–10:30']);
  const wl = R.winnersVsLosers(rows);
  assert.equal(wl.winners.hold, 2); assert.equal(wl.losers.size, 3);
});

test('fees: totals, share of gross, per trade and per contract, by month', () => {
  const rows = [row('2026-09-30', 1, { fees: 4, gross: 104, money: 100, contracts: 2 }), row('2026-10-01', -1, { fees: 6, gross: -94, money: -100, contracts: 2 }), row('2026-10-02', 1, { fees: null, gross: null })];
  const f = R.feeReport(rows);
  assert.equal(f.total.fees, 10); assert.equal(f.total.gross, 10); assert.equal(f.total.share, 1);
  assert.equal(f.perTrade, 5); assert.equal(f.perContract, 2.5); assert.equal(f.missing, 1);
  assert.deepEqual(f.months.map((m) => m.key), ['2026-10', '2026-09']);
});

test('tag groups: create, tag trades, stats, rename, cascade delete, backup', async () => {
  const post = (body: unknown) => tagsRoute.POST(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }));
  assert.equal((await post({ name: ' ' })).status, 400);
  const { id: g } = await (await post({ name: 'Entry model' })).json();
  const { id: a } = await (await post({ groupId: g, name: 'Turtle soup' })).json();
  const { id: b } = await (await post({ groupId: g, name: 'Breaker' })).json();
  assert.equal((await post({ groupId: 'nope', name: 'x' })).status, 404);
  assert.deepEqual(T.setTradeTags('t1', [a, a, 'unknown']), [a]);
  T.setTradeTags('t2', [a, b]);
  assert.deepEqual([...T.tradeTagMap().keys()].sort(), ['t1', 't2']);
  const groups = T.listTagGroups();
  const stats = R.tagStats([row('2026-10-01', 2, { tags: [a] }), row('2026-10-02', -1, { tags: [a, b] })], groups);
  assert.deepEqual(stats.map((s) => [s.name, s.n, s.netR]), [['Turtle soup', 2, 1], ['Breaker', 1, -1]]);
  T.renameTag(a, 'Turtle soup (TS)');
  const dump = T.exportTags();
  T.deleteGroup(g);
  assert.equal(T.listTagGroups().length, 0);
  assert.equal(T.tradeTagMap().size, 0, 'tags on trades go with the group');
  T.restoreTags(dump);
  assert.equal(T.listTagGroups()[0].tags[0].name, 'Turtle soup (TS)');
  assert.deepEqual(T.tagsForTrade('t2').sort(), [a, b].sort());
});
