/*
  What the market did (023): a second tag list, kept apart from "What went
  wrong", that round-trips, drops anything outside the list, never counts as
  a rule break, and has its own R breakdown in Stats.
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.SIGNATURE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'signature-market-'));
process.env.SIGNATURE_MIGRATIONS_DIR = path.resolve('db/migrations');

const { createTrade, getTrade, updateTrade } = await import('../db/trades');
const { parseTradeInput } = await import('../lib/validate');
const { adherenceOf } = await import('../lib/adherence');
const { rByMarketTag, rByMistakeTag } = await import('../lib/stats');
const { MARKET_TAGS } = await import('../lib/domain');

const raw = (t: Record<string, unknown> = {}) => ({
  date: '2026-10-01T08:00', instrument: 'NQ', direction: 'Short', session: 'NY AM', reason: 'Rules-based (A+ setup)',
  setup_type: 'iFVG', htf_bias: 'With bias', premium_discount: 'Premium', target_type: 'EQH/EQL',
  outcome: 'Win', r_multiple: 2, account: 'Live', explanation: 'E'.repeat(170), lesson: 'L'.repeat(170),
  screenshot_path: 'x.png', sweep_tier: 'major', singular_gap: true,
  chk_returned_to_fvg: true, chk_inversion_close: true, chk_htf_bias: true, chk_killzone: true, chk_no_news: true,
  chk_displacement_fvg: true, chk_targets_clear: true, chk_clean_path: true, ...t,
});
const make = (t: Record<string, unknown> = {}) => {
  const r = parseTradeInput(raw(t));
  if (!r.ok) throw new Error(r.error);
  return createTrade(r.value);
};

test('market tags round-trip, apart from the mistakes; unknown ones are dropped', () => {
  const t = make({ market_tags: ['Stopped by a wick', 'Nonsense', 'News spike'], mistake_tags: ['Entered late'] });
  const back = getTrade(t.id)!;
  assert.deepEqual(back.market_tags, ['Stopped by a wick', 'News spike']);
  assert.deepEqual(back.mistake_tags, ['Entered late']);
  // A trade from before 023 (or one never tagged) reads as no market tags.
  assert.deepEqual(make().market_tags, []);
  // An edit can change them.
  const r = parseTradeInput(raw({ market_tags: ["Didn't follow the plan"] }));
  if (!r.ok) throw new Error(r.error);
  assert.deepEqual(updateTrade(t.id, r.value)!.market_tags, ["Didn't follow the plan"]);
  assert.ok(MARKET_TAGS.length >= 4);
});

test('the market is never a rule break', () => {
  const t = make({ market_tags: [...MARKET_TAGS] });
  assert.equal(adherenceOf(t), 'followed');
});

test('Stats: R by what the market did, worst first, separate from R by mistake', () => {
  const list = [
    make({ outcome: 'Loss', r_multiple: -1, market_tags: ['Stopped by a wick'] }),
    make({ outcome: 'Loss', r_multiple: -1, market_tags: ['Stopped by a wick', 'Slippage'] }),
    make({ outcome: 'Win', r_multiple: 2, market_tags: ['Slippage'] }),
  ];
  const rows = rByMarketTag(list);
  assert.deepEqual(rows.map((x) => [x.tag, x.count, x.totalR]), [['Stopped by a wick', 2, -2], ['Slippage', 2, 1]]);
  assert.equal(rByMistakeTag(list).length, 0);
});
