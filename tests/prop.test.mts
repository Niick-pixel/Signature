/* The prop firm hub: which trades count, each drawdown type, daily loss, consistency, target, payouts, the session day. */
import test from 'node:test';
import assert from 'node:assert/strict';
const P = await import('../lib/prop');

let n = 0;
const t = (date: string, pnl: number, x: Record<string, unknown> = {}) => {
  n += 1;
  return { id: `p${n}`, date, account: 'Eval', account_label: 'Apex-1', status: 'Settled', outcome: pnl >= 0 ? 'Win' : 'Loss',
    pnl_dollars: pnl, risk_dollars: null, r_multiple: null, deleted_at: null, undated: false, contracts: 2, instrument: 'NQ', ...x } as never;
};
const acct = (x: Partial<Record<string, unknown>> = {}) => ({
  id: 'a', firm: 'Apex', plan: '50K', label: 'Apex-1', phase: 'eval', journal_account: 'Eval', status: 'active',
  started_on: '2026-10-01', ended_on: null, from_account_id: null, notes: null, created_at: '',
  ...P.PRESETS.find((p) => p.firm === 'Apex Trader Funding' && p.phase === 'eval' && p.rules.start_balance === 50000)!.rules, drawdown_type: 'eod_trailing', ...x,
}) as never;

test('which trades: label, journal account, dates; an unlabelled account takes labels nobody claims', () => {
  const trades = [t('2026-10-02T09:00', 100), t('2026-10-02T09:30', 50, { account_label: 'apex-1 ' }), t('2026-10-02T10:00', 10, { account_label: 'Topstep' }),
    t('2026-10-02T10:30', 10, { account: 'Funded' }), t('2026-09-30T10:00', 10), t('2026-10-03T10:00', 10, { status: 'Planned' }),
    t('2026-10-03T11:00', 10, { account_label: null })];
  const a = acct(); const b = acct({ id: 'b', label: '' });
  assert.equal(P.tradesFor(a, trades, [a, b]).length, 2);
  // b has no label: everything on Eval except what a claims (Apex-1), from its start.
  assert.deepEqual(P.tradesFor(b, trades, [a, b]).map((x) => (x as { account_label: string | null }).account_label), ['Topstep', null]);
});

test('EOD trailing: the floor follows the best close, stops at the lock, and a breach is dated', () => {
  const a = acct({ max_drawdown: 2000, trail_lock: 100 });
  const s = P.propStanding(a, [t('2026-10-02T09:00', 1000), t('2026-10-03T09:00', 1500), t('2026-10-06T09:00', -400)], [], '2026-10-06');
  assert.equal(s.balance, 52100);
  assert.equal(s.floor, 50100, 'peak 52500 − 2000 = 50500, capped at the lock 50100');
  assert.equal(s.room, 2000);
  assert.equal(s.breachedOn, null);
  const b = P.propStanding(acct({ max_drawdown: 2000, trail_lock: null }), [t('2026-10-02T09:00', 1500), t('2026-10-03T09:00', -1600)], [], '2026-10-03');
  assert.equal(b.floor, 49500); assert.equal(b.breachedOn, null, '49900 is above 49500');
  const c = P.propStanding(acct({ max_drawdown: 2000, trail_lock: null }), [t('2026-10-02T09:00', 1500), t('2026-10-03T09:00', -2100)], [], '2026-10-03');
  assert.equal(c.breachedOn, '2026-10-03');
  assert.equal(c.rules[0].state, 'broken');
});

test('intraday trailing: trade by trade, the peak inside the day counts', () => {
  const a = acct({ drawdown_type: 'intraday_trailing', max_drawdown: 2500, trail_lock: null });
  const s = P.propStanding(a, [t('2026-10-02T09:00', 2000), t('2026-10-02T10:00', -2600)], [], '2026-10-02');
  assert.equal(s.breachedOn, '2026-10-02 10:00', 'peak 52000 − 2500 = 49500; 49400 touches it');
  const eod = P.propStanding(acct({ max_drawdown: 2500, trail_lock: null }), [t('2026-10-02T09:00', 2000), t('2026-10-02T10:00', -2600)], [], '2026-10-02');
  assert.equal(eod.breachedOn, null, 'end of day only sees −600');
});

test('static drawdown never moves', () => {
  const s = P.propStanding(acct({ drawdown_type: 'static', max_drawdown: 2000 }), [t('2026-10-02T09:00', 3000)], [], '2026-10-02');
  assert.equal(s.floor, 48000);
});

test('daily loss: left today, days it was hit', () => {
  const a = acct({ daily_loss: 1000 });
  const s = P.propStanding(a, [t('2026-10-02T09:00', -1100), t('2026-10-06T09:00', -800)], [], '2026-10-06');
  assert.equal(s.today.dailyLeft, 200);
  assert.deepEqual(s.dailyBreaches, ['2026-10-02']);
  assert.equal(s.rules.find((r) => r.key === 'daily')!.state, 'warn');
});

test('consistency and the target: best day share, profit still needed, reached only with the days and no breach', () => {
  const a = acct({ consistency: 0.5, profit_target: 3000, min_days: 3 });
  const s = P.propStanding(a, [t('2026-10-02T09:00', 2000), t('2026-10-03T09:00', 1200)], [], '2026-10-03');
  assert.equal(s.consistencyRatio, 0.63);
  assert.equal(s.consistencyNeed, 800, '2000 / 0.5 − 3200');
  assert.equal(s.targetReached, false, 'two days of three, and the best day is too big');
  const ok = P.propStanding(a, [t('2026-10-02T09:00', 1200), t('2026-10-03T09:00', 1000), t('2026-10-06T09:00', 1000)], [], '2026-10-06');
  assert.equal(ok.targetReached, true);
  assert.equal(ok.rules.find((r) => r.key === 'target')!.state, 'ok');
});

test('contracts: micros count as a tenth of a mini', () => {
  const a = acct({ max_contracts: 5 });
  const s = P.propStanding(a, [t('2026-10-02T09:00', 10, { contracts: 6 }), t('2026-10-02T10:00', 10, { contracts: 40, instrument: 'MNQ' })], [], '2026-10-02');
  assert.deepEqual(s.oversize.map((o) => o.minis), [6]);
});

test('payouts: qualifying days since the last one, what is available, money received after the split', () => {
  const a = acct({ phase: 'funded', profit_target: null, max_drawdown: 2000, trail_lock: 100, qualify_amount: 150, payout_days: 3, payout_max: 2000, payout_split: 0.9 });
  const trades = [t('2026-10-02T09:00', 900), t('2026-10-03T09:00', 200), t('2026-10-06T09:00', 160), t('2026-10-07T09:00', 100)];
  const s = P.propStanding(a, trades, [], '2026-10-07');
  assert.equal(s.payout!.qualifying, 3);
  assert.equal(s.payout!.eligible, true);
  assert.equal(s.payout!.available, 1360, 'balance 51360 − max(start 50000, floor 49360)');
  const paid = [{ id: 'x', account_id: 'a', date: '2026-10-06', amount: 1000, received: null, status: 'paid' as const, note: null, created_at: '' }];
  const after = P.propStanding(a, trades, paid, '2026-10-07');
  assert.equal(after.balance, 50360);
  assert.equal(after.payout!.qualifying, 0, 'only days after the payout count');
  assert.equal(after.payout!.eligible, false);
  assert.equal(after.received, 900);
  assert.equal(after.profit, 1360, 'profit counts what was paid out');
  const ledger = P.propLedger([{ cost: 167 }, { cost: 85 }], [after]);
  assert.deepEqual(ledger, { spent: 252, received: 900, net: 648 });
});

test('session day: 6pm New York starts the next futures day', () => {
  // Costa Rica 15:59 = 17:59 New York (EDT) → same day; 16:00 = 18:00 → next day.
  assert.equal(P.sessionDay('2026-10-14T15:59', 'cme'), '2026-10-14');
  assert.equal(P.sessionDay('2026-10-14T16:00', 'cme'), '2026-10-15');
  assert.equal(P.sessionDay('2026-10-14T16:00', 'calendar'), '2026-10-14');
  // After the clocks change (EST): 17:00 Costa Rica = 18:00 New York.
  assert.equal(P.sessionDay('2026-11-10T16:30', 'cme'), '2026-11-10');
  assert.equal(P.sessionDay('2026-11-10T17:00', 'cme'), '2026-11-11');
});

test('rules from a form: percentages as whole numbers, typos dropped, never a refusal', () => {
  const base = P.PRESETS.find((p) => p.firm === 'Topstep' && p.phase === 'eval' && p.rules.start_balance === 50000)!.rules;
  const r = P.readRules({ consistency: '40', payout_split: 90, daily_loss: 'abc', start_balance: '-5', max_drawdown: '2500', drawdown_type: 'nope' }, base);
  assert.equal(r.consistency, 0.4); assert.equal(r.payout_split, 0.9); assert.equal(r.daily_loss, null);
  assert.equal(r.start_balance, base.start_balance); assert.equal(r.max_drawdown, 2500); assert.equal(r.drawdown_type, base.drawdown_type);
  assert.equal(P.readRules({}, base).profit_target, base.profit_target);
});

test('presets: every firm in its sizes, eval and funded, scaled', () => {
  const top = P.PRESETS.filter((p) => p.firm === 'Topstep');
  assert.deepEqual([...new Set(top.map((p) => p.rules.start_balance))], [50000, 100000, 150000]);
  const big = top.find((p) => p.phase === 'eval' && p.rules.start_balance === 150000)!;
  assert.equal(big.rules.profit_target, 9000); assert.equal(big.rules.max_drawdown, 4500); assert.equal(big.plan, '150K Trading Combine');
  assert.ok(P.PRESETS.filter((p) => p.firm === 'Apex Trader Funding').some((p) => p.rules.start_balance === 25000));
  assert.ok(P.PRESETS.every((p) => p.rules.start_balance > 0 && p.rules.max_drawdown > 0));
});
