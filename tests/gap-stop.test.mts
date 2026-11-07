/* The opposing HTF gap and the stop's place (040): the notes, the pre-selected tags, saved and kept, the sample's stop rule, the stats, the rollback. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.SIGNATURE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'signature-gap-stop-'));
process.env.SIGNATURE_MIGRATIONS_DIR = path.resolve('db/migrations');

const TC = await import('../lib/targetCheck');
const D = await import('../lib/domain');
const { parseTradeInput } = await import('../lib/validate');
const { allConditions, analyseTheme, THEMES } = await import('../lib/insights');
const A = await import('../lib/analytics');

const base = {
  date: '2026-11-03T09:50', instrument: 'NQ', direction: 'Long', session: 'NY AM', reason: 'Rules-based (A+ setup)', setup_type: 'iFVG',
  htf_bias: 'With bias', premium_discount: 'Discount', target_type: 'PDH/PDL', outcome: 'Loss', r_multiple: -1, account: 'Demo', status: 'Settled',
  explanation: 'x'.repeat(200), lesson: 'y'.repeat(200), screenshot_path: 'a.png',
};

test('the gap: a hint once one is named, the amber note only for 1H/4H with a 2+ R band', () => {
  assert.equal(TC.gapHint(null), null);
  assert.equal(TC.gapHint('None'), null);
  for (const g of ['5m', '15m', '1H', '4H']) assert.equal(TC.gapHint(g), "Measure to the gap's near edge.");

  const note = 'A 1H/4H gap sits before your target — is 2+ measured to its near edge?';
  assert.equal(TC.gapNote('1H', '2+'), note);
  assert.equal(TC.gapNote('4H', '2+'), note);
  for (const [g, b] of [['15m', '2+'], ['5m', '2+'], ['None', '2+'], [null, '2+'], ['1H', '1.5-2'], ['4H', '<1'], ['4H', null]] as const) {
    assert.equal(TC.gapNote(g, b), null, `${g} / ${b}`);
  }
});

test('the stop: an amber note only inside the zone', () => {
  assert.equal(TC.stopNote('Inside the zone'), "Inside the zone you're relying on — any retest takes you out.");
  for (const p of ['Beyond sweep extreme', 'Beyond HTF zone far edge', 'Under-over the iFVG', null]) assert.equal(TC.stopNote(p), null);
});

test('the notes never block: a 1H gap at 2+ with the stop inside the zone saves, and the target check verdict is unchanged', () => {
  const r = parseTradeInput({ ...base, opposing_htf_gap: '1H', r_to_nearest_bucket: '2+', stop_placement: 'Inside the zone' });
  assert.ok(r.ok);
  const v = TC.targetCheck({ target_type: 'PDH/PDL', nearest_liquidity_type: 'PDH/PDL', nearest_liquidity_price: null, opposing_swings_between: '0',
    entry_price: null, stop_loss: null, stop_points: null, eqhl_checks: null, r_to_nearest_bucket: '2+' });
  assert.deepEqual([v.passed, v.warnings], [true, []]);
});

test('the new tags exist on the right side, and the server accepts them', () => {
  assert.ok((D.MISTAKE_TAGS as readonly string[]).includes('Opposing HTF gap in path'));
  assert.ok((D.MISTAKE_TAGS as readonly string[]).includes('Stop inside zone'));
  assert.ok((D.WORKED_TAGS as readonly string[]).includes('Stop beyond the zone'));
  const r = parseTradeInput({ ...base, mistake_tags: ['Opposing HTF gap in path', 'Stop inside zone'], worked_tags: ['Stop beyond the zone'] });
  assert.ok(r.ok);
  const v = (r as { value: Record<string, unknown> }).value;
  assert.deepEqual([v.mistake_tags, v.worked_tags], [['Opposing HTF gap in path', 'Stop inside zone'], ['Stop beyond the zone']]);
});

test('pre-selected tags: implied by the fields, added and taken off with them, a hand edit respected', () => {
  assert.deepEqual(TC.impliedMistakes({}), []);
  assert.deepEqual(TC.impliedMistakes({ opposing_htf_gap: 'None', stop_placement: 'Beyond sweep extreme' }), []);
  assert.deepEqual(TC.impliedMistakes({ opposing_htf_gap: '15m', stop_placement: 'Inside the zone' }), ['Opposing HTF gap in path', 'Stop inside zone']);

  const sync = (tags: string[], before: Record<string, string | null>, after: Record<string, string | null>) =>
    TC.syncImplied(tags, TC.impliedMistakes(before), TC.impliedMistakes(after));
  // Picking a gap adds its tag, next to what was already chosen by hand.
  assert.deepEqual(sync(['Chased'], { opposing_htf_gap: null }, { opposing_htf_gap: '4H' }), ['Chased', 'Opposing HTF gap in path']);
  // Changing to another gap keeps it once, not twice.
  assert.deepEqual(sync(['Opposing HTF gap in path'], { opposing_htf_gap: '4H' }, { opposing_htf_gap: '1H' }), ['Opposing HTF gap in path']);
  // Back to None takes it off; the hand-picked tag stays.
  assert.deepEqual(sync(['Chased', 'Opposing HTF gap in path'], { opposing_htf_gap: '4H' }, { opposing_htf_gap: 'None' }), ['Chased']);
  // Taken off by hand while the gap is still set: another field's change does not put it back.
  assert.deepEqual(sync([], { opposing_htf_gap: '4H', stop_placement: null }, { opposing_htf_gap: '4H', stop_placement: 'Under-over the iFVG' }), []);
  // The stop inside the zone, and moved out again.
  assert.deepEqual(sync([], { stop_placement: null }, { stop_placement: 'Inside the zone' }), ['Stop inside zone']);
  assert.deepEqual(sync(['Stop inside zone', 'Moved stop'], { stop_placement: 'Inside the zone' }, { stop_placement: 'Beyond HTF zone far edge' }), ['Moved stop']);
});

test('validation: known values kept, anything else not recorded, a key left out keeps what is stored', () => {
  const ok = parseTradeInput({ ...base, opposing_htf_gap: '4H', stop_placement: 'Beyond HTF zone far edge' });
  const v = (ok as { value: Record<string, unknown> }).value;
  assert.deepEqual([v.opposing_htf_gap, v.stop_placement], ['4H', 'Beyond HTF zone far edge']);

  const odd = parseTradeInput({ ...base, opposing_htf_gap: '2H', stop_placement: 'Somewhere' });
  assert.ok(odd.ok, 'an unknown value is never a reason to refuse the save');
  const o = (odd as { value: Record<string, unknown> }).value;
  assert.deepEqual([o.opposing_htf_gap, o.stop_placement], [null, null]);

  const old = parseTradeInput({ ...base });
  const ov = (old as { value: Record<string, unknown> }).value;
  assert.deepEqual([ov.opposing_htf_gap, ov.stop_placement], [null, null], 'a trade that never answered: null');

  const kept = parseTradeInput({ ...base }, { previous: { explanation: base.explanation, lesson: base.lesson, stored: { opposing_htf_gap: '15m', stop_placement: 'Inside the zone' } } });
  const kv = (kept as { value: Record<string, unknown> }).value;
  assert.deepEqual([kv.opposing_htf_gap, kv.stop_placement], ['15m', 'Inside the zone']);
});

/* ---------------------------------------------------------------- stats */

let n = 0;
const tr = (r: number, x: Record<string, unknown> = {}) => {
  n += 1;
  return {
    id: `g${n}`, date: `2026-10-${String(1 + (n % 27)).padStart(2, '0')}T09:45`, created_at: '2026-10-01T20:00:00.000Z', account: 'Demo', status: 'Settled',
    outcome: r > 0 ? 'Win' : r < 0 ? 'Loss' : 'Breakeven', r_multiple: r, direction: 'Long', premium_discount: 'Discount', htf_bias: 'With bias',
    sweep_tier: 'major', target_type: 'PDH/PDL', setup_type: 'iFVG', session: 'NY AM', management: 'BE at 1R', chk_killzone: true,
    confidence_at_entry: 3, followed_rules: null, target_check_passed: null, graded_post_hoc: false, overrides: null, undated: false,
    mistake_tags: [], worked_tags: [], market_tags: [], explanation: '', lesson: '', deleted_at: null,
    opposing_htf_gap: null, stop_placement: null, ...x,
  } as never;
};

test('Learn from your mistakes: both fields as conditions, with vs without, only among trades that recorded them', () => {
  const trades = [
    tr(-1, { stop_placement: 'Inside the zone' }), tr(-1, { stop_placement: 'Inside the zone' }), tr(0.5, { stop_placement: 'Inside the zone' }),
    tr(2, { stop_placement: 'Beyond sweep extreme' }), tr(3, { stop_placement: 'Beyond HTF zone far edge' }), tr(1, { stop_placement: 'Under-over the iFVG' }),
    tr(-1, { opposing_htf_gap: '4H' }), tr(-1, { opposing_htf_gap: '1H' }),
    tr(2, { opposing_htf_gap: 'None' }), tr(2, { opposing_htf_gap: 'None' }),
    // Old trades: neither field recorded. Big winners, so counting them as "without" would skew every delta.
    tr(5), tr(5), tr(5), tr(5),
  ];
  const all = allConditions(trades);
  const c = (id: string) => all.find((x) => x.id === id);

  const inside = c('stop-inside')!;
  assert.deepEqual([inside.n, inside.avgR, inside.othersAvgR], [3, -0.5, 2], 'without = the other three placements, not the old trades');
  const beyond = c('stop-beyond')!;
  assert.deepEqual([beyond.n, beyond.avgR], [2, 2.5]);
  const gap = c('htf-gap')!;
  assert.deepEqual([gap.n, gap.avgR, gap.othersAvgR], [2, -1, 2]);
  assert.deepEqual([c('htf-gap-big')!.n, c('htf-gap-big')!.delta], [2, -3]);

  // The same sample-size guard as every condition: two or more trades on each side, or it is not listed.
  const thin = allConditions([tr(-1, { stop_placement: 'Inside the zone' }), tr(2, { stop_placement: 'Beyond sweep extreme' }), tr(1, { stop_placement: 'Beyond sweep extreme' }), tr(5), tr(5)]);
  assert.equal(thin.find((x) => x.id === 'stop-inside'), undefined);

  // The themes read them as evidence; the stop theme also counts the field as its signal.
  const stop = analyseTheme(THEMES.find((x) => x.id === 'stop')!, trades, all);
  assert.equal(stop.n, 3);
  assert.ok(stop.evidence.some((e) => e.id === 'stop-inside') && stop.evidence.some((e) => e.id === 'stop-beyond'));
  const target = analyseTheme(THEMES.find((x) => x.id === 'target')!, trades, all);
  assert.ok(target.evidence.some((e) => e.id === 'htf-gap'));
  // The tags join the conditions on their own.
  const tagged = allConditions([...trades, tr(-1, { mistake_tags: ['Stop inside zone'] }), tr(-2, { mistake_tags: ['Stop inside zone'] })]);
  assert.ok(tagged.some((x) => x.id === 'mistake:Stop inside zone'));
});

test('Analytics: each gap and stop placement against the rest, old trades on neither side, the same minimum on both sides', () => {
  const ts = [
    tr(-1, { stop_placement: 'Inside the zone' }), tr(-1, { stop_placement: 'Inside the zone' }),
    tr(2, { stop_placement: 'Beyond sweep extreme' }), tr(2, { stop_placement: 'Beyond sweep extreme' }),
    tr(-1, { opposing_htf_gap: '4H' }), tr(1, { opposing_htf_gap: 'None' }), tr(1, { opposing_htf_gap: 'None' }),
    tr(9), tr(9),
  ];
  const rows = A.confluences(ts, 2);
  const row = (id: string) => rows.find((r) => r.id === id)!;
  const inside = row('stop_placement:Inside the zone');
  assert.deepEqual([inside.group, inside.n, inside.avgR, inside.delta], ['Stop', 2, -1, -3]);
  // One trade with it: listed, but marked early — the existing rule for every row.
  assert.deepEqual([row('opposing_htf_gap:4H').n, row('opposing_htf_gap:4H').early], [1, true]);
  assert.equal(row('opposing_htf_gap:any').n, 1);
  assert.equal(row('opposing_htf_gap:None').delta, null, 'its other side is the single 4H trade');
});

/* ------------------------------------------------------------ the database */

test('saved and read back; older trades read null; the sample rule; the rollback drops only what 040 added', async () => {
  const { getDb } = await import('../db/index');
  const { createTrade, getTrade } = await import('../db/trades');
  const R = await import('../db/sampleRule');

  const cols = () => (getDb().prepare('PRAGMA table_xinfo(trades)').all() as Array<{ name: string }>).map((c) => c.name);
  assert.ok(cols().includes('opposing_htf_gap') && cols().includes('stop_placement'));

  const p = parseTradeInput({ ...base, opposing_htf_gap: '4H', stop_placement: 'Inside the zone', mistake_tags: ['Opposing HTF gap in path', 'Stop inside zone'] });
  const t = createTrade((p as { value: never }).value);
  const back = getTrade(t.id)!;
  assert.deepEqual([back.opposing_htf_gap, back.stop_placement, back.mistake_tags], ['4H', 'Inside the zone', ['Opposing HTF gap in path', 'Stop inside zone']]);

  const plain = createTrade((parseTradeInput({ ...base }) as { value: never }).value);
  assert.deepEqual([getTrade(plain.id)!.opposing_htf_gap, getTrade(plain.id)!.stop_placement], [null, null]);

  // The column refuses anything outside the list, even past the validator.
  assert.throws(() => getDb().prepare('UPDATE trades SET stop_placement = ? WHERE id = ?').run('Nowhere', t.id));

  assert.equal(R.getSampleStopRule(), null, 'unset until pinned');
  assert.equal(R.setSampleStopRule('Beyond sweep extreme'), 'Beyond sweep extreme');
  assert.equal(R.getSampleStopRule(), 'Beyond sweep extreme');
  assert.equal(R.setSampleStopRule('Nowhere'), null, 'anything but a placement clears it');
  assert.equal(R.getSampleStopRule(), null);
  R.setSampleStopRule('Under-over the iFVG');

  const { rollback } = await import('../db/cli-rollback');
  rollback('040', getDb());
  assert.ok(!cols().includes('opposing_htf_gap') && !cols().includes('stop_placement'));
  assert.ok(cols().includes('stop_method') && cols().includes('r_to_nearest_bucket'), 'older columns untouched');
  assert.equal((getDb().prepare('SELECT count(*) n FROM trades').get() as { n: number }).n, 2, 'the trades themselves survive');
  assert.equal((getDb().prepare("SELECT count(*) n FROM app_settings WHERE key = 'backtest_stop_rule'").get() as { n: number }).n, 0);
});
