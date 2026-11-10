/* The Flaw Deck engine: ranking, at most five, honest chips, no rule-loosening drill, where it happens, graduation, relapse, the cover, storage. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.SIGNATURE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'signature-flaws-'));
process.env.SIGNATURE_MIGRATIONS_DIR = path.resolve('db/migrations');

const F = await import('../lib/edge/flaws');
const { compare } = await import('../lib/edge/compare');
const { FLAW_TEXT } = await import('../lib/edge/flawText');

let n = 0;
const tr = (r: number, x: Record<string, unknown> = {}) => {
  n += 1;
  return {
    id: `f${n}`, date: `2026-10-${String(1 + (n % 27)).padStart(2, '0')}T09:${String(n % 60).padStart(2, '0')}`,
    created_at: `2026-10-01T00:00:${String(n).padStart(2, '0')}.${String(n).padStart(3, '0')}Z`,
    account: 'Demo', outcome: r > 0 ? 'Win' : r < 0 ? 'Loss' : 'Breakeven', r_multiple: r, screenshot_path: `s/${n}.png`,
    lesson: '', explanation: '', mistake_tags: [], drill_key: null, drill_kept: null, mfe_bucket: null, ...x,
  } as never as import('../lib/types').Trade;
};

const emptyExec = { losers: 0, losersWithMfe: 0, mgmtLeak: [], neverPositive: [], winners: 0, winnersWithMae: 0, stopSurvived: [], earlyBe: { ids: [], costR: 0 }, efficiency: { n: 0, mean: null }, planned: [] };
const emptySpread = { grades: [], gradeN: 0, oneGrade: null, items: [], scores: { n: 0, distinct: 0, atOrAbove: 0, threshold: 70 } };

/** A theme on a set of trades, compared as the ledger does. */
function themeOn(id: string, title: string, trades: import('../lib/types').Trade[], hit: (t: import('../lib/types').Trade) => boolean) {
  const yes = trades.filter(hit); const no = trades.filter((t) => !hit(t));
  return { id, title, rule: `If ${title} then stop.`, n: yes.length, cmp: compare(yes.map((t) => t.r_multiple as number), no.map((t) => t.r_multiple as number), { total: trades.length }), totalR: 0, trend: [], last: null, tradeIds: yes.map((t) => t.id).reverse() };
}

function inputs(trades: import('../lib/types').Trade[], themes: ReturnType<typeof themeOn>[], extra: Partial<Parameters<typeof F.findFlaws>[0]> = {}) {
  return {
    settled: trades, ledger: { themes, repeated: [], contradictions: [], rules: [], losses: [] },
    exec: emptyExec, states: new Map(), spread: emptySpread, missed: null,
    themesOf: (t: import('../lib/types').Trade) => themes.filter((th) => th.tradeIds.includes(t.id)).map((th) => th.id),
    breaksOf: () => [], ...extra,
  } as Parameters<typeof F.findFlaws>[0];
}

test('ranked by P(real) × |cost| × recent frequency; at most five; never a strength', () => {
  const trades = Array.from({ length: 60 }, (_, i) => tr(i % 3 === 0 ? -1 : i % 3 === 1 ? 1.5 : 2, {}));
  const ids = (k: number) => (t: import('../lib/types').Trade) => Number(t.id.slice(1)) % k === 0;
  // Seven costly themes of different strength, and one that pays.
  const themes = [
    themeOn('early', 'Entering before confirmation', trades, (t) => (t.r_multiple as number) < 0 && ids(2)(t)),
    themeOn('late', 'Late entries', trades, (t) => (t.r_multiple as number) < 0 && ids(5)(t)),
    themeOn('target', 'Weak targets', trades, (t) => (t.r_multiple as number) < 0 && ids(7)(t)),
    themeOn('bias', 'Against bias', trades, (t) => (t.r_multiple as number) < 0 && ids(3)(t)),
    themeOn('pd', 'Wrong side', trades, (t) => (t.r_multiple as number) < 0 && ids(11)(t)),
    themeOn('sweep', 'No sweep', trades, (t) => (t.r_multiple as number) < 0 && ids(13)(t)),
    themeOn('fear', 'Fear', trades, (t) => (t.r_multiple as number) < 0 && ids(4)(t)),
    themeOn('prep', 'Good prep', trades, (t) => (t.r_multiple as number) > 1.6),
  ];
  const flaws = F.findFlaws(inputs(trades, themes));
  assert.ok(flaws.length <= F.MAX_FLAWS, 'never more than five');
  assert.ok(!flaws.some((f) => f.key === 'theme:prep'), 'a strength is never a flaw');
  for (let k = 1; k < flaws.length; k++) assert.ok(flaws[k - 1].priority >= flaws[k].priority, 'in priority order');
  assert.ok(flaws.every((f) => f.costPer != null && f.costPer < 0));
});

test('a repeated lesson joins on "Too early" evidence, and its chip says so', () => {
  const trades = Array.from({ length: 12 }, (_, i) => tr(i % 2 ? 1 : -1));
  const quotes = trades.slice(-4).map((t) => ({ id: t.id, date: t.date.slice(0, 10), text: 'I entered before the close again.' }));
  const flaws = F.findFlaws({ ...inputs(trades, []), ledger: { themes: [], repeated: [{ id: 'early', title: 'Entering before confirmation', rule: 'r', quotes }], contradictions: [], rules: [], losses: [] } });
  const f = flaws.find((x) => x.key === 'theme:early')!;
  assert.ok(f, 'in the deck');
  assert.equal(f.processOnly, true);
  assert.equal(f.chip, 'Pattern in your writing · R impact too early');
  assert.equal(f.quote?.text, 'I entered before the close again.');
  assert.equal(f.drill, FLAW_TEXT.early.drill, 'the library drill for early entries');
});

test('a filter that does not filter joins too, honestly labelled', () => {
  const trades = Array.from({ length: 20 }, () => tr(1));
  const spread = { ...emptySpread, oneGrade: 'A', items: [{ key: 'a', label: 'Killzone', yes: 20, answered: 20, share: 1, notFiltering: true }] };
  const f = F.findFlaws({ ...inputs(trades, []), spread }).find((x) => x.key === 'filter')!;
  assert.equal(f.chip, 'Your filter does not filter · R impact too early');
  assert.match(f.title, /graded A/);
});

test('a drill that would loosen a written rule keeps the flaw off the deck', () => {
  for (const ok of Object.values(FLAW_TEXT)) assert.equal(F.loosensRule(ok.drill), false, ok.drill);
  for (const bad of ['Trade outside the killzone when it looks clean.', 'Take another trade after a loss.', 'Widen my stop past the sweep.', 'Enter without the trigger on strong days.']) {
    assert.equal(F.loosensRule(bad), true, bad);
  }
  const base = { key: 'theme:x', type: 'theme' as const, title: 'x', hits: [], n: 3, recent: 3, cmp: null, costPer: -0.5, level: 'likely' as const, chip: 'Likely', processOnly: false, priority: 1,
    where: { live: 0, demo: 0, eval: 0, backtest: 0, line: null }, quote: null, quotes: [], why: '', tightens: null, examples: [], timeline: [], chart: { kind: 'scores' as const, skip: null, take: null, lo: null, hi: null } };
  assert.deepEqual(F.rankFlaws([{ ...base, drill: 'Take more trades when you feel it.' }]), []);
  assert.equal(F.rankFlaws([{ ...base, drill: 'I wait for the close.' }]).length, 1);
});

test('where it happens: only live is pressure, in backtests too is a skill gap', () => {
  const bt = Array.from({ length: 12 }, () => tr(1, { account: 'Backtest (FX Replay)' }));
  const live = [tr(-1, { account: 'Live' }), tr(-1, { account: 'Demo' })];
  assert.equal(F.whereItHappens(live, [...bt, ...live]).line, 'Only live — this is pressure, not skill.');
  const both = [live[0], bt[0], bt[1]];
  const w = F.whereItHappens(both, [...bt, ...live]);
  assert.deepEqual([w.live, w.demo, w.backtest, w.line], [1, 0, 2, 'In backtests too — this is a skill gap.']);
  assert.equal(F.whereItHappens([live[0]], live).line, null, 'too few backtests to say');
});

test('graduation: 20 clean trades in a row with the drill kept on 90% of them; relapse: twice in 20 after', () => {
  const start = '2026-10-01T00:00:00.000Z';
  const hitKey = new Set<string>();
  const run = (count: number, x: Record<string, unknown>) => Array.from({ length: count }, () => tr(1, x));
  const flawy = run(3, { drill_key: 'theme:early', drill_kept: 'broken' });
  flawy.forEach((t) => hitKey.add(t.id));
  const clean = run(20, { drill_key: 'theme:early', drill_kept: 'kept' });
  const hit = (t: import('../lib/types').Trade) => hitKey.has(t.id);
  const work = { started_at: start, baseline_rate: 0.3, flaw_key: 'theme:early' };
  const p = F.progress(work, [...flawy, ...clean], hit);
  assert.equal(p.clean, 20);
  assert.equal(p.kept, 20);
  assert.equal(p.graduated, true);
  assert.equal(p.rateBefore, 3);
  // Kept on only 17 of 20: not yet.
  const loose = run(20, { drill_key: 'theme:early', drill_kept: 'kept' });
  loose.slice(0, 3).forEach((t) => Object.assign(t, { drill_kept: 'broken' }));
  assert.equal(F.progress(work, loose, hit).graduated, false);
  // 19 clean: not yet.
  assert.equal(F.progress(work, [...flawy, ...clean.slice(1)], hit).graduated, false);

  // Relapse: twice within the 20 trades after it was fixed.
  const ended = clean[clean.length - 1].created_at;
  const after = run(5, {});
  hitKey.add(after[1].id); hitKey.add(after[3].id);
  assert.equal(F.relapsed({ ended_at: ended }, [...clean, ...after], hit), true);
  hitKey.delete(after[3].id);
  assert.equal(F.relapsed({ ended_at: ended }, [...clean, ...after], hit), false, 'once is not a relapse');
});

test('the cover: a backtest-heavy blend is said plainly, and the real number leads', () => {
  const trades = [...Array.from({ length: 45 }, () => tr(1, { account: 'Backtest (FX Replay)' })), ...Array.from({ length: 10 }, () => tr(1, { account: 'Demo' }))];
  const c = F.coverSplit(trades);
  assert.deepEqual([c.real, c.backtest, c.mostlyReplay], [10, 45, true]);
  assert.equal(c.line, 'Mostly replay: 45 of 55 trades are backtests. Live + demo: 10 trades — too early to know.');
  assert.equal(F.coverSplit(trades.slice(40)).mostlyReplay, false);
});

test('storage: one active drill, the old one paused; snooze for 20 trades; rewritten drill kept; rollback drops only what 042 added', async () => {
  const D = await import('../db/flaws');
  const { getDb } = await import('../db/index');
  const a = D.startWork('theme:early', 'I wait for the close.', { rate: 0.3, n: 30 });
  assert.equal(D.activeWork()?.id, a.id);
  const b = D.startWork('tilt:after-loss', 'Ten minutes after a loss.', { rate: 0.2, n: 30 });
  assert.equal(D.activeWork()?.id, b.id);
  assert.equal(D.listWork().find((w) => w.id === a.id)?.status, 'paused');
  // The database itself refuses a second active drill.
  assert.throws(() => D.setStatus(a.id, 'active'));

  D.setDrill('tilt:after-loss', '  Walk for ten minutes after a loss.  ');
  assert.equal(D.drillOverrides().get('tilt:after-loss'), 'Walk for ten minutes after a loss.');
  assert.equal(D.activeWork()?.drill_text, 'Walk for ten minutes after a loss.', 'the active drill follows its card');
  D.setDrill('tilt:after-loss', '');
  assert.equal(D.drillOverrides().has('tilt:after-loss'), false, 'empty goes back to the library');

  D.snooze('hesitation', 12);
  assert.equal(D.listWork().find((w) => w.flaw_key === 'hesitation')?.snooze_until, 32);

  const { rollback } = await import('../db/cli-rollback');
  rollback('042', getDb());
  const cols = (getDb().prepare('PRAGMA table_xinfo(trades)').all() as Array<{ name: string }>).map((c) => c.name);
  assert.ok(!cols.includes('drill_key') && !cols.includes('drill_kept') && cols.includes('stop_placement'));
  assert.equal((getDb().prepare("SELECT count(*) n FROM sqlite_master WHERE name IN ('flaw_work','flaw_drills')").get() as { n: number }).n, 0);
});

test('any key names itself and has a drill, even when it is not ranked today', () => {
  const early = F.describeKey('theme:early');
  assert.equal(early.drill, FLAW_TEXT.early.drill);
  assert.notEqual(early.title, 'early', 'a theme reads its title, not its id');
  assert.equal(F.describeKey('rule:pd').title, 'Breaking: Right side of the range');
  assert.match(F.describeKey('rule:pd').drill, /right side of the range/);
  assert.equal(F.describeKey('exec:early-be').title, 'Breakeven too early');
  assert.ok(F.describeKey('exec:early-be').drill.length > 0);
  for (const k of ['tilt:after-loss', 'filter', 'hesitation', 'data']) assert.ok(F.describeKey(k).drill, `${k} has a drill`);
});

test('data and filter flaws graduate too: a trade logs every field; a filter is judged on the last 20 together', () => {
  const work = (key: string) => ({ started_at: '2026-10-01T00:00:00.000Z', baseline_rate: 0.5, flaw_key: key });
  const full = { liquidity_event: 'PDH/PDL', entry_method: 'Inversion close', candle_strength: 'Strong', planned_rr: 2, exit_reason: 'TP', mfe_bucket: '2R+', moved_to_be: 'No', stop_placement: 'Beyond the FVG', opposing_htf_gap: 'None' };
  const hit = F.hitTest('data', { themesOf: () => [], breaksOf: () => [], states: new Map(), exec: emptyExec as never });
  assert.equal(hit(tr(1, full)), false);
  assert.equal(hit(tr(1, { ...full, entry_method: null })), true, 'one missing field is a hit');
  const logged = Array.from({ length: 20 }, () => tr(1, { ...full, drill_key: 'data', drill_kept: 'kept' }));
  assert.equal(F.progress(work('data'), logged, hit).graduated, true);

  // Every setup an A: not fixed. A spread of grades over the last 20: fixed.
  const graded = (g: string) => tr(1, { grade_letter: g, graded_post_hoc: false, drill_key: 'filter', drill_kept: 'kept' });
  const allA = Array.from({ length: 20 }, () => graded('A'));
  assert.equal(F.progress(work('filter'), allA, () => false).graduated, false);
  const spread = Array.from({ length: 20 }, (_, i) => graded(['A', 'B', 'C'][i % 3]));
  const p = F.progress(work('filter'), spread, () => false);
  assert.equal(p.graduated, true);
  // Relapse: the next 20 are all A again.
  const ended = spread[spread.length - 1].created_at;
  const after = Array.from({ length: 20 }, () => graded('A'));
  assert.equal(F.relapsed({ ended_at: ended, flaw_key: 'filter' }, [...spread, ...after], () => false), true);
  assert.equal(F.relapsed({ ended_at: ended, flaw_key: 'filter' }, [...spread, ...after.slice(0, 10)], () => false), false, 'judged only on a full 20');
});
