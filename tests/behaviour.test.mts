/* Mistake cost, what if, and tilt: behaviour measured from the trades. */
import test from 'node:test';
import assert from 'node:assert/strict';
const B = await import('../lib/behaviour');

let n = 0;
const t = (day: string, time: string, r: number, o: Record<string, unknown> = {}) => {
  n += 1;
  return { id: `b${n}`, date: `${day}T${time}`, entry_time: time, exit_time: null, chart_date: null, account: 'Topstep 50K', session: 'NY AM',
    grade_letter: 'A', mistake_tags: [], confidence_at_entry: null, contracts: 1, risk_dollars: 100, pnl_dollars: null,
    r_multiple: r, outcome: r > 0 ? 'Win' : r < 0 ? 'Loss' : 'Breakeven', ...o } as never;
};

test('mistake cost: each tag against clean trades, in R and dollars, worst first', () => {
  const ts = [
    t('2026-10-01', '08:40', 1), t('2026-10-02', '08:40', 1), t('2026-10-05', '08:40', 1),
    t('2026-10-06', '08:40', -1, { mistake_tags: ['Chased'] }), t('2026-10-07', '08:40', -1, { mistake_tags: ['Chased', 'Oversized'] }),
    t('2026-10-08', '08:40', 2, { mistake_tags: ['Cut winner early'] }),
    t('2026-06-01', '08:40', -5, { mistake_tags: ['Revenge'] }),
  ];
  const m = B.mistakeCost(ts, '2026-10-01', '2026-10-29');
  assert.equal(m.trades, 6); assert.equal(m.clean.avgR, 1);
  assert.equal(m.rows[0].tag, 'Chased'); assert.equal(m.rows[0].vsCleanR, -4); assert.equal(m.rows[0].vsCleanMoney, -400);
  assert.ok(!m.rows.some((r) => r.tag === 'Revenge'), 'outside the stretch');
  assert.equal(m.totalVsCleanR, -3, 'overlapping tags counted once in the total: −2 −2 +1');
  assert.match(m.headline, /cost you 3\.00R, about \$300/);
  assert.deepEqual(m.rows[0].months, [0, 0, 2]);
  assert.match(B.mistakeCost([t('2026-10-01', '08:40', 1)], null, '2026-10-29').headline, /No mistake tags/);
});

test('what if: stop after one loss counts only losses still taken; grade and first-trade rules skip', () => {
  const ts = [
    t('2026-10-01', '08:40', -1), t('2026-10-01', '09:00', -1), t('2026-10-01', '09:20', 3),
    t('2026-10-02', '08:40', 2, { grade_letter: 'C' }), t('2026-10-02', '09:10', -1),
  ];
  const none = B.whatIf(ts, []);
  assert.equal(none.actual.netR, 2); assert.equal(none.then.netR, 2); assert.equal(none.skipped, 0);
  const s1 = B.whatIf(ts, ['stop1']);
  assert.equal(s1.then.netR, 0, 'day 1: only the first loss; day 2: win then loss'); assert.equal(s1.skipped, 2);
  assert.equal(s1.curve.length, 5); assert.equal(s1.curve[4].actual, 2); assert.equal(s1.curve[4].then, 0);
  const ga = B.whatIf(ts, ['grade_a', 'stop1']);
  assert.equal(ga.then.netR, -2, 'without the C trade, day 2 starts with the loss');
  assert.equal(B.whatIf(ts, ['first']).then.n, 2);
  assert.ok(s1.actual.maxDD <= 0);
  assert.match(s1.line, /2 trades skipped/);
});

test('tilt: fast and sized-up re-entries after a loss, measured against your usual wait', () => {
  const days = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-12'];
  // A usual wait of 30 min after a win.
  const ts = days.flatMap((d) => [t(d, '08:30', 1, { exit_time: '08:40' }), t(d, '09:10', 0.5)]);
  ts.push(t('2026-10-13', '08:30', -1, { exit_time: '08:40' }), t('2026-10-13', '08:44', -1, { contracts: 2, exit_time: '08:50' }), t('2026-10-13', '09:40', 1));
  ts.push(t('2026-10-14', '08:30', -1, { exit_time: '08:40' }), t('2026-10-14', '09:30', 1.5));
  const tl = B.tilt(ts);
  assert.equal(tl.usualWait, 30); assert.equal(tl.fastUnder, 15);
  const e = tl.events.find((x) => x.at === '08:44')!;
  assert.deepEqual(e.kinds, ['fast', 'bigger']); assert.equal(e.gap, 4);
  assert.deepEqual(tl.events.find((x) => x.at === '09:40')!.kinds, ['after_two']);
  assert.equal(tl.tilted.n, 2); assert.equal(tl.patient.n, 1); assert.equal(tl.patient.avgR, 1.5);
  const no = B.whatIf(ts, ['no_tilt']);
  assert.equal(no.skipped, 2);
});

test('tilt now: only after a loss today, with minutes since', () => {
  const ts = [t('2026-10-29', '08:30', 1, { exit_time: '08:35' }), t('2026-10-29', '08:50', -1, { exit_time: '09:00' })];
  const now = B.tiltNow(ts, '2026-10-29', 9 * 60 + 6)!;
  assert.equal(now.minutesSince, 6); assert.equal(now.lossAt, '09:00'); assert.equal(now.fastUnder, 10);
  assert.equal(B.tiltNow(ts.slice(0, 1), '2026-10-29', 600), null);
  assert.equal(B.tiltNow(ts, '2026-10-30', 600), null);
});
