/* The week, pre-written: numbers per world, patterns, rules broken, best and worst, the page. */
import test from 'node:test';
import assert from 'node:assert/strict';
const { weekReview, weekReviewHtml } = await import('../lib/weekly');

let n = 0;
const t = (d: string, x: Record<string, unknown> = {}) => {
  n += 1;
  return {
    id: `w${n}`, date: `${d}T09:45`, created_at: `${d}T15:00:00.000Z`, account: 'Demo', status: 'Settled', outcome: 'Win',
    r_multiple: 2, direction: 'Long', premium_discount: 'Discount', sweep_tier: 'major', trigger_fired: true, target_type: 'PDH/PDL',
    r_to_nearest_bucket: '2+', chk_killzone: true, chk_no_news: true, management: 'BE at 1R', mfe_r: 2, undated: false,
    setup_type: 'iFVG', grade_letter: 'A', mistake_tags: [], worked_tags: [], explanation: '', lesson: '', screenshot_path: null,
    deleted_at: null, ...x,
  } as never;
};

test('the week: real and backtest apart, patterns, rules broken, best and worst', () => {
  const trades = [
    t('2026-10-12', { outcome: 'Loss', r_multiple: -1 }),                                     // last week: out
    t('2026-10-19', { r_multiple: 1.5, lesson: 'Data wick target, clean draw.', screenshot_path: 'a.png' }),
    t('2026-10-20', { outcome: 'Loss', r_multiple: -1, trigger_fired: false, lesson: 'I entered too soon, no clean target.' }),
    t('2026-10-21', { account: 'Backtest (FX Replay)', outcome: 'Loss', r_multiple: -1 }),
  ];
  const w = weekReview(trades, '2026-10-19');
  assert.deepEqual([w.real.n, w.real.netR, w.backtest.n, w.backtest.netR], [2, 0.5, 1, -1]);
  assert.ok(w.patterns.some((p) => p.id === 'early') && w.patterns.some((p) => p.id === 'target'));
  assert.deepEqual(w.broken, [{ short: 'Inversion close', count: 1 }]);
  assert.equal(w.best?.r, 1.5);
  assert.equal(w.worst?.r, -1);
  const html = weekReviewHtml(w);
  for (const h of ['The week in numbers', 'Patterns in my writing', 'Rules broken', 'Best and worst trade']) assert.ok(html.includes(h), h);
  assert.ok(html.includes('<img src="/api/screenshots/a.png?w=720"'));
});
