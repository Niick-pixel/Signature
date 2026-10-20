/* The review engine: every rule, the day rules, the sample-size guard, the ranking. */
import test from 'node:test';
import assert from 'node:assert/strict';
const { TRADE_RULES, DAY_RULES, DEFAULT_RULE_CONFIG } = await import('../lib/ruleBook');
const { checkTrade, checkDay, trends, ruleImpacts, sessionClose, beforeYouTrade, allSettled, dayBreaksByTrade } = await import('../lib/review');

let n = 0;
/** A trade that keeps every rule; override what each test breaks. */
const t = (x: Record<string, unknown> = {}) => {
  n += 1;
  return {
    id: `t${n}`, date: `2026-10-${String(1 + (n % 27)).padStart(2, '0')}T09:45`, created_at: '2026-10-01T15:00:00.000Z',
    account: 'Demo', status: 'Settled', outcome: 'Win', r_multiple: 2, direction: 'Long', premium_discount: 'Discount',
    htf_bias: 'With bias', sweep_tier: 'major', trigger_fired: true, target_type: 'PDH/PDL', r_to_nearest_bucket: '2+',
    r_to_nearest: null, chk_killzone: true, chk_no_news: true, management: 'BE at 1R', mgmt_plan: null, mfe_r: 2,
    exit_time: null, undated: false, confidence_at_entry: 4, followed_rules: true, target_check_passed: true,
    grade_letter: 'A', mistake_tags: [], worked_tags: [], explanation: '', lesson: '', deleted_at: null, ...x,
  } as never;
};
const ids = (rs: Array<{ id: string }>) => rs.map((r) => r.id);

test('a trade that keeps every rule breaks none', () => {
  assert.deepEqual(checkTrade(t()), []);
});

test('each trade rule, broken on its own', () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ['sweep', { sweep_tier: 'none' }],
    ['inversion', { trigger_fired: false }],
    ['named-target', { target_type: 'Other' }],
    ['named-target', { target_type: 'Order block' }],
    ['min-r', { r_to_nearest_bucket: '1-1.5' }],
    ['min-r', { r_to_nearest_bucket: null, r_to_nearest: 1.4 }],
    ['pd', { premium_discount: 'Premium' }],
    ['pd', { direction: 'Short', premium_discount: 'Discount' }],
    ['killzone', { chk_killzone: false }],
    ['management', { management: null, mgmt_plan: null }],
    ['max-r', { mfe_r: null }],
  ];
  for (const [id, x] of cases) assert.deepEqual(ids(checkTrade(t(x))), [id], `${id} ${JSON.stringify(x)}`);
  // Your answers: a horizontal pool is a named pool, equilibrium is fine, 1.5R is enough.
  assert.deepEqual(checkTrade(t({ target_type: 'Horizontal liquidity pool' })), []);
  assert.deepEqual(checkTrade(t({ premium_discount: 'Equilibrium' })), []);
  assert.deepEqual(checkTrade(t({ direction: 'Short', premium_discount: 'Equilibrium' })), []);
  assert.deepEqual(checkTrade(t({ r_to_nearest_bucket: '1.5-2' })), []);
  assert.equal(TRADE_RULES.length, 8);
});

test('silence is not a break: unanswered fields are not counted', () => {
  assert.deepEqual(checkTrade(t({ sweep_tier: null, chk_killzone: null, r_to_nearest_bucket: null, premium_discount: null })), []);
  // An older plan A/B still counts as a management plan.
  assert.deepEqual(checkTrade(t({ management: null, mgmt_plan: 'A' })), []);
  // A bucket straddling a custom minimum cannot tell.
  assert.deepEqual(checkTrade(t({ r_to_nearest_bucket: '1.5-2' }), { ...DEFAULT_RULE_CONFIG, minR: 1.75 }), []);
  assert.deepEqual(ids(checkTrade(t({ r_to_nearest_bucket: '1.5-2' }), { ...DEFAULT_RULE_CONFIG, minR: 2 })), ['min-r']);
});

test('missed trades and passes break nothing', () => {
  assert.deepEqual(checkTrade(t({ account: 'Missed', sweep_tier: 'none' })), []);
  assert.deepEqual(checkTrade(t({ outcome: 'Not taken', sweep_tier: 'none' })), []);
});

test('day rules: the third trade after two losses, the 10-minute cooldown, the news day', () => {
  const d = (time: string, x: Record<string, unknown> = {}) => t({ date: `2026-10-14T${time}`, ...x });
  const a = d('09:35', { outcome: 'Loss', r_multiple: -1 });
  const b = d('09:41', { outcome: 'Loss', r_multiple: -1 });   // 6 min after a loss
  const c = d('10:30');                                         // after 2 losses
  const day = checkDay([c, a, b]);
  assert.deepEqual(day.find((r) => r.id === 'stop-after-losses')?.tradeIds, [c.id]);
  assert.deepEqual(day.find((r) => r.id === 'cooldown')?.tradeIds, [b.id]);
  assert.equal(day.find((r) => r.id === 'news-day'), undefined);
  // A stricter day (the prep said stop after 1 loss).
  assert.deepEqual(checkDay([a, b, c], DEFAULT_RULE_CONFIG, { maxLosses: 1 }).find((r) => r.id === 'stop-after-losses')?.tradeIds, [b.id, c.id]);
  // The cooldown counts from the exit when it is recorded.
  const e = d('11:00', { outcome: 'Loss', r_multiple: -1, exit_time: '11:20' });
  const f = d('11:25');
  assert.deepEqual(checkDay([e, f]).find((r) => r.id === 'cooldown')?.tradeIds, [f.id]);
  // Red-folder day: from the morning check-in, or a trade's own checklist.
  assert.deepEqual(checkDay([d('09:50')], DEFAULT_RULE_CONFIG, { redFolder: true })[0].id, 'news-day');
  const g = d('09:50', { chk_no_news: false }); const h = d('10:10');
  assert.deepEqual(checkDay([g, h]).find((r) => r.id === 'news-day')?.tradeIds, [g.id, h.id]);
  assert.equal(DAY_RULES.length, 3);
});

test('backtests (and undated trades) skip the day rules', () => {
  const bt = (time: string) => t({ account: 'Backtest (FX Replay)', date: `2026-10-15T${time}`, outcome: 'Loss', r_multiple: -1 });
  assert.deepEqual(checkDay([bt('21:00'), bt('21:02'), bt('21:04')]), []);
  assert.deepEqual(checkDay([t({ undated: true, outcome: 'Loss', r_multiple: -1 }), t({ undated: true })]), []);
  // ...but still get the trade rules.
  assert.deepEqual(ids(checkTrade(bt('21:00') as never)), []);
});

test('trends: rolling R, last 10 vs previous 10, lesson repeated, grade honesty', () => {
  const ts = [
    ...Array.from({ length: 10 }, (_, i) => t({ date: `2026-09-${String(i + 1).padStart(2, '0')}T09:45`, sweep_tier: 'none', outcome: 'Loss', r_multiple: -1, grade_letter: 'C' })),
    ...Array.from({ length: 10 }, (_, i) => t({ date: `2026-10-${String(i + 1).padStart(2, '0')}T09:45`, grade_letter: 'A' })),
  ];
  ts[3] = t({ date: '2026-09-04T09:45', outcome: 'Loss', r_multiple: -1, sweep_tier: 'none', grade_letter: 'C', lesson: 'Entered against my bias again.' });
  ts[5] = t({ date: '2026-09-06T09:45', outcome: 'Loss', r_multiple: -1, sweep_tier: 'none', grade_letter: 'C', htf_bias: 'Against bias' });
  const r = trends(ts);
  assert.equal(r.n, 20);
  assert.equal(r.rolling.at(-1)!.avgR, 2);
  const sweep = r.rules.find((x) => x.id === 'sweep')!;
  assert.deepEqual([sweep.last10.pct, sweep.prev10.pct, sweep.change], [1, 0, 100]);
  assert.deepEqual(r.repeats.map((x) => [x.theme, x.after]), [['bias', 2]]);
  assert.deepEqual(r.grades.map((g) => [g.letter, g.avgR]), [['A', 2], ['C', -1]]);
  assert.equal(trends(ts.slice(0, 4)).early, true);
  assert.equal(trends(ts.slice(-4)).rules[0].early, true, 'n < 5: early signal');
});

test('the #1 rule needs 20 trades in view and 5 breaks', () => {
  const ts = [
    ...Array.from({ length: 6 }, () => t({ sweep_tier: 'none', outcome: 'Loss', r_multiple: -1 })),
    ...Array.from({ length: 14 }, () => t()),
  ];
  assert.equal(ruleImpacts(ts).top?.id, 'sweep');
  assert.equal(ruleImpacts(ts.slice(0, 19)).top, null, 'under 20 trades');
  const few = [...Array.from({ length: 4 }, () => t({ sweep_tier: 'none', outcome: 'Loss', r_multiple: -1 })), ...Array.from({ length: 16 }, () => t())];
  assert.equal(ruleImpacts(few).top, null, 'broken fewer than 5 times');
});

test('session close: at most three lines, ranked by |R impact| × recency', () => {
  const session = [
    t({ date: '2026-10-16T09:35', outcome: 'Loss', r_multiple: -1, trigger_fired: false, lesson: 'There was no clean target, unsure of it.' }),
    t({ date: '2026-10-16T10:05', outcome: 'Win', r_multiple: 3, worked_tags: ['Waited for the close'] }),
  ];
  const history = [
    ...Array.from({ length: 6 }, () => t({ outcome: 'Loss', r_multiple: -1, lesson: 'No clean target again.' })),
    ...session,
  ];
  const lines = sessionClose(session, history);
  assert.ok(lines.length <= 3);
  assert.deepEqual(lines.map((l) => l.kind), ['paid', 'broken', 'watch'], JSON.stringify(lines));
  assert.equal(lines.find((l) => l.kind === 'broken')!.text, TRADE_RULES.find((r) => r.id === 'inversion')!.text);
  // The later trade weighs more: the same break, first vs last in the session.
  const brokenScore = (ts: unknown[]) => sessionClose(ts as never, []).find((l) => l.kind === 'broken')!.score;
  const at = (h: string, x: Record<string, unknown> = {}) => t({ date: `2026-10-17T${h}`, ...x });
  const bad = { trigger_fired: false, outcome: 'Loss', r_multiple: -1 };
  const first = brokenScore([at('09:35', bad), at('10:00'), at('10:30')]);
  const last = brokenScore([at('09:35'), at('10:00'), at('10:30', bad)]);
  assert.equal(last, 1);
  assert.ok(Math.abs(first - 0.85 ** 2) < 1e-9 && first < last);
  assert.equal(allSettled([t(), t({ status: 'Live' })]), false);
});

test('before you trade: the leak waits for 20 trades; last session; days since the #1 rule', () => {
  const day = (d: string, x: Record<string, unknown> = {}) => t({ date: `${d}T09:45`, created_at: `${d}T15:00:00.000Z`, ...x });
  const ts = [
    ...Array.from({ length: 6 }, (_, i) => day(`2026-10-0${i + 1}`, { sweep_tier: 'none', outcome: 'Loss', r_multiple: -1, lesson: 'No sweep, no fuel.' })),
    ...Array.from({ length: 14 }, (_, i) => day(`2026-10-${String(i + 7).padStart(2, '0')}`)),
  ];
  const b = beforeYouTrade(ts, '2026-10-21');
  assert.equal(b.lastSession?.day, '2026-10-20');
  // The #1 leak is "no sweep, no fuel", so the line is the rule behind it.
  assert.equal(b.leak?.title, 'No sweep, no fuel');
  assert.equal(b.topRule?.text, TRADE_RULES.find((r) => r.id === 'sweep')!.text);
  assert.equal(b.topRule?.linked, true);
  assert.equal(b.topRule?.lastBroken, '2026-10-06');
  assert.equal(b.topRule?.daysSince, 15);
  const small = beforeYouTrade(ts.slice(0, 10), '2026-10-21');
  assert.equal(small.leak, null);
  assert.match(small.leakWaiting ?? '', /10 of 20/);
  assert.equal(small.topRule, null);
});

test('day breaks are listed per trade', () => {
  const a = t({ date: '2026-10-20T09:35', outcome: 'Loss', r_multiple: -1 });
  const b = t({ date: '2026-10-20T09:40' });
  assert.deepEqual(dayBreaksByTrade([a, b]).get(b.id)?.map((x) => x.id), ['cooldown']);
});

test('a rule says nothing about trades logged before its field existed', async () => {
  const { fieldEras } = await import('../lib/review');
  const old = t({ created_at: '2026-09-01T15:00:00.000Z', mfe_r: null, management: null });
  const asked = t({ created_at: '2026-10-01T15:00:00.000Z', mfe_r: 1, management: 'BE at 1R' });
  const skipped = t({ created_at: '2026-10-02T15:00:00.000Z', mfe_r: null, management: 'BE at 1R' });
  const eras = fieldEras([old, asked, skipped]);
  assert.deepEqual(checkTrade(old, DEFAULT_RULE_CONFIG, eras), []);
  assert.deepEqual(ids(checkTrade(skipped, DEFAULT_RULE_CONFIG, eras)), ['max-r']);
});
