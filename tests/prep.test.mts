/*
  The chart prep and the journal export: the prep document survives any input
  (an earlier version's included), the first save's time is kept, and the
  journal export reads the way it was written.
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.SIGNATURE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'signature-prep-'));
process.env.SIGNATURE_MIGRATIONS_DIR = path.resolve('db/migrations');

const { PREP_STEPS, PANEL_STEPS, LEGACY_STEPS, EMPTY_PREP, parsePrepData, prepProgress, prepMarkdown, answerKey, deriveDecisions, planChecks, gradeCeiling, overnightRead, planSummary } = await import('../lib/prep');
const PM = await import('../lib/planMatch');
const { savePrep, getPrep, previousPrep, listPreps } = await import('../db/prep');
const { toMarkdown } = await import('../lib/sanitise');
const { journalExport } = await import('../lib/journalExport');

test('six steps, top-down, ending in two plans — the decisions keep the keys the rest of the app reads', () => {
  assert.deepEqual(PREP_STEPS.map((s) => s.id), ['news', 'htf', 'overnight', 'map', 'location', 'plans']);
  // Off-model things stay out: no order blocks, breakers or S/R zones; and the script's settings line is gone.
  const words = JSON.stringify(PREP_STEPS);
  for (const gone of ['Order block', 'breaker', 'resistance', 'support', 'Uptrend', 'Costa Rica time', 'A+ only showing']) {
    assert.ok(!words.toLowerCase().includes(gone.toLowerCase()), gone);
  }
  for (const s of PREP_STEPS) for (const f of s.fields) {
    assert.ok(['one', 'many', 'pick', 'text'].includes(f.kind), `${s.id}.${f.id}`);
    if (f.kind !== 'text') assert.ok(f.options.length >= 2, `${s.id}.${f.id}`);
  }
  const keys = PREP_STEPS.flatMap((s) => s.fields.map((f) => answerKey(s, f)));
  for (const k of ['session.news', 'session.stop', 'liquidity.taken', 'panel.above', 'panel.below', 'htf.bias', 'htf.because', 'htf.inv',
    'plans.aStory', 'plans.aTrigger', 'plans.aKill', 'plans.bKill', 'plans.cutoff']) assert.ok(keys.includes(k), k);
  // Every field of the scenario table, for both scenarios.
  for (const k of ['a', 'b']) for (const f of ['Dir', 'Story', 'Trigger', 'TriggerNote', 'Confirm', 'Target', 'TargetNote', 'RR', 'Kill']) assert.ok(keys.includes(`plans.${k}${f}`), `${k}${f}`);
  // The two versions before are kept, to read what was saved under them.
  assert.deepEqual(PANEL_STEPS.map((s) => s.id), ['panel', 'heatmap', 'plan']);
  assert.deepEqual(LEGACY_STEPS.map((s) => s.id), ['bias', 'liquidity', 'gaps', 'heatmap', 'draw', 'session']);
});

test('prepped: every step of the new prep; a panel prep keeps its 3 steps, a six-step one its 4-of-6 rule', () => {
  const now = (steps: Record<string, string>) => prepProgress(parsePrepData({ steps }));
  assert.deepEqual(now({ news: 'done', htf: 'done' }), { answered: 2, done: 2, total: 6, complete: false });
  assert.equal(now({ news: 'done', htf: 'done', overnight: 'done', map: 'done', location: 'done', plans: 'done' }).complete, true);
  assert.equal(now({ news: 'done', htf: 'done', overnight: 'done', map: 'done', location: 'skipped', plans: 'done' }).complete, false);
  assert.deepEqual(now({ panel: 'done', heatmap: 'done' }), { answered: 2, done: 2, total: 3, complete: false });
  assert.equal(now({ panel: 'done', heatmap: 'done', plan: 'done' }).complete, true);
  assert.deepEqual(now({ bias: 'done', liquidity: 'done', gaps: 'done', draw: 'done' }), { answered: 4, done: 4, total: 6, complete: true });
  // An answer under its old key still reads, by any version.
  const d = parsePrepData({ steps: { plan: 'done' }, answers: { 'draw.side': 'Longs only', 'session.stop': '1 loss', 'panel.h1': 'Bullish', 'panel.h4': 'Sideways' } });
  assert.deepEqual(d.answers, { 'draw.side': 'Longs only', 'session.stop': '1 loss', 'panel.h1': 'Bullish' });
});

test('written answers are kept (trimmed of nothing, cut at 400 characters); an empty one is not an answer', () => {
  const d = parsePrepData({ answers: { 'htf.because': 'the 4H displaced up', 'plans.aKill': '   ', 'plans.aStory': 'x'.repeat(900), 'plans.nope': 'y' } });
  assert.equal(d.answers['htf.because'], 'the 4H displaced up');
  assert.equal(d.answers['plans.aKill'], undefined);
  assert.equal((d.answers['plans.aStory'] as string).length, 400);
  assert.equal(d.answers['plans.nope'], undefined);
});

test('the plans give the side, the sweeps to wait for and the target — plan match reads them unchanged', () => {
  const plans = { 'plans.aDir': 'Short', 'plans.aTrigger': 'London high', 'plans.aTarget': 'Session high/low', 'plans.bDir': 'Long', 'plans.bTrigger': 'Asia low', 'liquidity.taken': ['Asia low'] };
  const d = deriveDecisions(plans);
  assert.equal(d['draw.side'], 'Both ways');
  assert.equal(d['draw.direction'], 'Down');
  assert.deepEqual(d['liquidity.wait'], ['London high'], 'a level already run is not one to wait for');
  assert.equal(d['draw.target'], 'Session high/low');
  assert.equal(deriveDecisions({ 'plans.aDir': 'Long' })['draw.side'], 'Longs only');
  assert.equal(deriveDecisions({ 'plans.aDir': 'Short', 'plans.bDir': 'Short' })['draw.side'], 'Shorts only');
  // A gap is a trigger zone, not a sweep.
  assert.equal(deriveDecisions({ 'plans.aDir': 'Long', 'plans.aTrigger': '4H gap' })['liquidity.wait'], undefined);
  // No plan written: whatever the prep held is untouched.
  const old = { 'draw.side': 'Longs only', 'liquidity.wait': ['PDL'] };
  assert.deepEqual(deriveDecisions(old), old);
  // And it is what planMatch needs: a long when only shorts were planned is off plan.
  const { planMatch } = PM;
  const m = planMatch({ account: 'Demo', undated: false, direction: 'Long', sweep_level: 'PDH', target_type: null, date: '2026-11-11T08:40' },
    { steps: {}, ticks: {}, answers: deriveDecisions({ 'plans.aDir': 'Short', 'plans.aTrigger': 'London high' }) });
  assert.equal(m.status, 'off');
});

test('the three rules, checked as you write: different first liquidity, a kill switch each, A with the bias', () => {
  const same = planChecks({ 'plans.aTrigger': 'PDH', 'plans.bTrigger': 'PDH', 'plans.aKill': 'x', 'plans.bKill': 'y' });
  assert.ok(same.some((c) => c.level === 'warn' && /differ in which liquidity/.test(c.text)));
  const noKill = planChecks({ 'plans.aStory': 'Judas up', 'plans.bTrigger': 'Asia low', 'plans.bKill': '15m close below' });
  assert.deepEqual(noKill.map((c) => c.text.slice(0, 32)), ["Scenario A has no kill switch. I"]);
  assert.match(noKill[0].text, /a hope, not a plan/);
  assert.ok(planChecks({ 'htf.bias': 'Bullish', 'plans.aDir': 'Short', 'plans.aKill': 'k' }).some((c) => /against your bullish bias/.test(c.text)));
  assert.deepEqual(planChecks({}), [], 'nothing written, nothing to say');
  // Grade ceiling: with the bias A+, against it B max, no honest bias A+ only.
  assert.equal(gradeCeiling({ 'htf.bias': 'Bearish', 'plans.aDir': 'Short' }, 'a'), 'Can reach A+');
  assert.equal(gradeCeiling({ 'htf.bias': 'Bearish', 'plans.bDir': 'Long' }, 'b'), 'B max — against the bias');
  assert.equal(gradeCeiling({ 'htf.bias': 'Neutral' }, 'b'), 'A+ only — no bias');
});

test('overnight: what is still there, and which side was run; the plan reads as a few rows ending in C', () => {
  assert.equal(overnightRead({ 'liquidity.taken': ['Asia high', 'London high'] }).line, 'Highs run, lows untouched: the resting liquidity is below.');
  assert.ok(overnightRead({ 'liquidity.taken': ['Asia high'] }).stillThere.includes('London high'));
  assert.equal(overnightRead({}).line, null);
  const rows = planSummary({ 'htf.bias': 'Bullish', 'htf.because': 'the 4H displaced up', 'htf.inv': '21,310',
    'plans.aStory': 'Sweep of the Asia low, then long', 'plans.aTargetNote': 'PDH', 'plans.aRR': '2+', 'plans.aKill': 'a 15m close below 21,280', 'plans.cutoff': '9:45' });
  assert.deepEqual(rows.map((r) => r.label), ['Bias', 'Scenario A', 'Scenario C']);
  assert.equal(rows[0].value, '4H/1H bias is bullish because the 4H displaced up. Invalidated by a 1H body close beyond 21,310.');
  assert.equal(rows[1].value, 'Sweep of the Asia low, then long → PDH · 2+R · killed by a 15m close below 21,280');
  assert.match(rows[2].value, /by 9:45/);
  assert.equal(planSummary({}).length, 0);
});

test('any input reads as a valid prep; answers outside the options are dropped', () => {
  assert.deepEqual(parsePrepData(null), EMPTY_PREP);
  assert.deepEqual(parsePrepData('garbage'), EMPTY_PREP);
  const d = parsePrepData({
    steps: { bias: 'done', liquidity: 'skipped', zones: 'done', gaps: 'maybe' },
    ticks: { bias: [0, 0, 9, -1, 'x'] },
    answers: {
      'bias.bias': 'Bullish', 'bias.zone': 'Somewhere', 'liquidity.taken': ['PDH', 'PWL', 'Nope'],
      'draw.target': 'EQH/EQL', 'draw.nope': 'x', 'liquidity.wait': [],
      // What the ten-step prep stored: dropped, not refused.
      'htf.daily': 'Uptrend', 'zones.where': 'At support',
    },
    // What the first version stored: prices and all.
    levels: [{ id: 'a', step: 'eqhl', kind: 'EQH', price: 30906 }], draw: { direction: 'Up', target: 30906 },
  });
  assert.deepEqual(d.steps, { bias: 'done', liquidity: 'skipped' });
  assert.deepEqual(d.ticks, { bias: [0] });
  assert.deepEqual(d.answers, { 'bias.bias': 'Bullish', 'liquidity.taken': ['PDH', 'PWL'], 'draw.target': 'EQH/EQL' });
  assert.deepEqual(prepProgress(d), { answered: 2, done: 1, total: 6, complete: false });
});

test('saving keeps the first start time and the first finish time', async () => {
  const first = savePrep('2026-09-29', parsePrepData({ steps: { bias: 'done' } }));
  assert.ok(first.started_at);
  assert.equal(first.completed_at, null);
  await new Promise((r) => setTimeout(r, 15));
  const later = savePrep('2026-09-29', parsePrepData({ steps: { bias: 'done', liquidity: 'done' } }), true);
  assert.equal(later.started_at, first.started_at);
  assert.ok(later.completed_at);
  await new Promise((r) => setTimeout(r, 15));
  const again = savePrep('2026-09-29', later.data, true);
  assert.equal(again.completed_at, later.completed_at);
  assert.equal(getPrep('2026-09-29')!.data.steps.liquidity, 'done');
  savePrep('2026-09-30', EMPTY_PREP);
  assert.equal(previousPrep('2026-09-30')!.day, '2026-09-29');
  assert.equal(listPreps().length, 2);
});

test('the prep in Markdown says what was answered and marked', () => {
  const md = prepMarkdown({
    day: '2026-09-30', started_at: '2026-09-30T12:10:00.000Z', completed_at: null, updated_at: '',
    data: parsePrepData({
      steps: { bias: 'done', liquidity: 'skipped' },
      ticks: { bias: [0] },
      answers: { 'bias.bias': 'Bullish', 'bias.zone': 'Discount', 'draw.direction': 'Up', 'draw.target': 'EQH/EQL', 'liquidity.wait': ['Asia high', 'PDL'] },
    }),
  });
  assert.match(md, /1 of 6 steps marked, 1 skipped/);
  assert.match(md, /Bias: htf bias Bullish; price is in Discount · 1\/3 marked/);
  assert.match(md, /Draw and plan: price draws Up; target EQH\/EQL · 0\/4 marked/);
  assert.match(md, /Liquidity to sweep: sweep to wait for PDL, Asia high/);
  assert.doesNotMatch(md, /Session and rules/);
});

test('journal pages keep their shape in Markdown', () => {
  const md = toMarkdown('<h2>Patience</h2><p>I <strong>waited</strong> for the <em>close</em>.</p><ul><li>one</li><li>two</li></ul><ol><li>a</li><li>b</li></ol><blockquote><p>Wait.</p></blockquote><p>Chart <img src="x.png"> &amp; more</p>');
  assert.equal(md, '### Patience\n\nI **waited** for the *close*.\n\n- one\n- two\n\n1. a\n2. b\n\n> Wait.\n\nChart [image] & more');
});

test('the journal export lays each page on its day, with the day beside it', () => {
  const now = new Date('2026-09-30T20:00:00Z');
  const page = (day: string, title: string, body: string, pinned = false) => ({
    id: title, day, title, body, plain: body.replace(/<[^>]*>/g, ''), pinned, created_at: `${day}T20:00:00Z`, updated_at: '',
  });
  const trade = { date: '2026-09-29T09:41:00', instrument: 'NQ', direction: 'Long', setup_type: 'iFVG', grade_letter: 'C',
    outcome: 'Loss', r_multiple: -1, reason: 'FOMO', account: 'Live', mistake_tags: ['Chased'], worked_tags: [],
    lesson: 'Waited for nothing and chased it.' } as never;
  const doc = journalExport({
    range: '30', now,
    pages: [page('2026-09-29', 'Chasing again', '<p>I <strong>chased</strong> the open.</p>'),
      page('2026-01-02', 'My rules', '<p>Only A setups.</p>', true), page('2026-05-01', 'Old', '<p>old</p>')],
    trades: [trade],
    reviews: [{ day: '2026-09-29', checked_in_at: '2026-09-29T12:00:00Z', sleep_hours: 5, state_of_mind: 2, bias_direction: 'Bullish', bias: 'daily FVG', news: 'High', news_note: 'CPI 8:30', trades_planned: 2 } as never],
    preps: [{ day: '2026-09-29', started_at: null, completed_at: null, updated_at: '', data: parsePrepData({ answers: { 'draw.direction': 'Up', 'draw.target': 'EQH/EQL' } }) }],
  });
  const md = doc.markdown;
  assert.match(md, /^# My trading journal — last 30 days/);
  assert.match(md, /## For Claude: what this is and what I would like/);
  assert.match(md, /Show me where what I write and what I do disagree/);
  assert.match(md, /### Tuesday 29 September 2026 — 1 page · 1 trade, −1\.0R/);
  assert.match(md, /\*\*Morning:\*\* checked in .* · slept 5h · mind 2\/5 · bias Bullish — daily FVG · news High \(CPI 8:30\) · planned at most 2/);
  assert.match(md, /Decisions: price draws Up; target EQH\/EQL/);
  assert.match(md, /- 09:41 NQ Long · iFVG · grade C \(checklist rubric \d\) · Loss −1\.0R · why: FOMO · Live · went wrong: Chased/);
  assert.match(md, /Lesson: "Waited for nothing and chased it\."/);
  assert.match(md, /#### Page: Chasing again\n\nI \*\*chased\*\* the open\./);
  // Pinned pages from before the range still come along; old unpinned ones do not.
  assert.match(md, /## Pinned pages[\s\S]*My rules/);
  assert.doesNotMatch(md, /Old/);
  assert.equal(doc.pages, 1);
  assert.equal(doc.filename, 'signature-journal-30d-2026-09-30');
});

test('045: a trade that names its plan is set against that scenario; neither is off plan; R by scenario and by bias', () => {
  const { planMatch, scenarioSplit, biasSplit } = PM;
  const prep = { steps: {}, ticks: {}, answers: deriveDecisions({ 'htf.bias': 'Bearish', 'plans.aDir': 'Short', 'plans.aTrigger': 'London high', 'plans.aTarget': 'Session high/low', 'plans.bDir': 'Long', 'plans.bTrigger': 'Asia low' }) };
  const t = (o: Record<string, unknown>) => ({ account: 'Demo', undated: false, direction: 'Short', sweep_level: 'London high', target_type: 'Session high/low', date: '2026-11-11T08:40', outcome: 'Win', r_multiple: 1, plan_scenario: null, ...o }) as never;
  assert.equal(planMatch(t({ plan_scenario: 'A' }), prep).status, 'in');
  // Named B, but took the short: off plan, although the day's plans allowed both sides.
  const b = planMatch(t({ plan_scenario: 'B' }), prep);
  assert.equal(b.status, 'off'); assert.match(b.diffs[0], /Scenario B was a long, took a short/);
  assert.deepEqual(planMatch(t({ plan_scenario: 'none' }), prep).diffs, ['not one of the plans written that morning']);
  // Unanswered: the day's derived decisions, as before.
  assert.equal(planMatch(t({}), prep).status, 'in');

  const byDay = new Map([['2026-11-11', prep]]);
  const trades = [t({ plan_scenario: 'A', r_multiple: 2 }), t({ plan_scenario: 'A', r_multiple: -1, outcome: 'Loss' }), t({ plan_scenario: 'none', r_multiple: -1, outcome: 'Loss', direction: 'Long' }), t({}),
    t({ plan_scenario: 'A', account: 'Backtest (FX Replay)' }), t({ plan_scenario: 'B', outcome: 'Not taken' })];
  const s = scenarioSplit(trades, byDay);
  assert.deepEqual(s.rows.map((r) => [r.key, r.n, r.avgR]), [['A', 2, 0.5], ['B', 0, null], ['none', 1, -1]]);
  assert.equal(s.unasked, 1, 'a real trade on a planned day that never said');
  assert.deepEqual(biasSplit(trades, byDay).map((r) => [r.key, r.n]), [['with', 3], ['against', 1], ['neutral', 0]]);
});
