/* Edge Engine, milestone 9: theme dictionary and text, the language table, missed trades, backtests as a prior; the 037 tables. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.SIGNATURE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'signature-edge-text-'));
process.env.SIGNATURE_MIGRATIONS_DIR = path.resolve('db/migrations');

const X = await import('../lib/edge/text');
const { missedStats } = await import('../lib/edge/missed');
const { explore } = await import('../lib/edge/explorer');
const { field } = await import('../lib/edge/fields');
const { ledgerV2 } = await import('../lib/edge/ledger');

let n = 0;
const t = (x: Record<string, unknown> = {}) => { n += 1; return { id: `x${n}`, date: `2026-07-${String(1 + (n % 28)).padStart(2, '0')}T09:40`, account: 'Demo', r_multiple: 1, outcome: 'Win', lesson: '', explanation: '', mistake_tags: [], worked_tags: [], deleted_at: null, undated: false, session_index: null, ...x } as never; };

test('stemming and negation: "waited" meets "wait"; "didn\'t wait" is not "wait"; a negative phrase matches itself', () => {
  assert.equal(X.stem('waiting'), 'wait'); assert.equal(X.stem('waited'), 'wait'); assert.equal(X.stem('entries'), 'entry');
  assert.ok(X.phraseIn('I waited for the close this time.', 'wait for the close'));
  assert.ok(!X.phraseIn("I didn't wait for the close.", 'wait for the close'));
  assert.ok(!X.phraseIn('I did not wait for the close.', 'wait'));
  assert.ok(X.phraseIn("Again I didn't wait, jumped in.", "didn't wait"));
  assert.ok(X.phraseIn('Pure FOMO on that one.', 'fomo'));
});

test('the dictionary adds to the built-in themes, and can name a new one', () => {
  const dict = [{ theme: 'early', phrase: 'jumped in' }, { theme: 'FOMO', phrase: 'fomo' }];
  const a = t({ lesson: 'Jumped in before anything formed.' }); const b = t({ lesson: 'Pure fomo.' }); const c = t({ lesson: 'I never jumped in, I waited.' });
  assert.ok(X.themesWith(a, dict).includes('early'));
  assert.ok(X.themesWith(b, dict).includes('FOMO'));
  assert.ok(!X.themesWith(c, dict).includes('early'), 'negated: not a theme');
  assert.ok(X.allThemes(dict).some((d) => d.id === 'FOMO' && d.custom));
  const l = ledgerV2([b, t({ lesson: 'fomo again' }), t({ lesson: 'fomo, third time', r_multiple: -1 }), t({ r_multiple: -1 })], () => [], { words: dict });
  assert.ok(l.themes.some((x) => x.id === 'FOMO' && x.n === 3));
  assert.ok(l.repeated.some((r) => r.id === 'FOMO'));
});

test('the language table: outcome words removed, facts normalised, suggestions, BH on top', () => {
  assert.equal(X.normalise('Entered on the 1 min FVG at the equal highs').includes('tf:1m'), true);
  assert.ok(X.normalise('1-min, 1m and 1min').match(/tf:1m/g)!.length === 3);
  assert.ok(X.normalise('swept the asian high').includes('ASIA_HIGH'));
  const xs = Array.from({ length: 20 }, (_, i) => t({ r_multiple: i % 2 ? 2 : -1, lesson: i % 2 ? 'Clean sweep of eqh, patient entry. Win.' : 'Loss, stopped out, mistake, chased the 1m FVG.' }));
  const L = X.language(xs);
  const texts = L.phrases.map((p) => p.text);
  for (const w of ['loss', 'win', 'stopped', 'mistake']) assert.ok(!texts.some((p) => p.split(' ').includes(w)), w);
  assert.ok(texts.some((p) => p.includes('EQH')));
  assert.ok(L.suggestions.some((s) => s.token === 'EQH') && L.suggestions.some((s) => s.token === 'tf:1m'));
  // A shorter phrase on exactly the same trades as a longer one is dropped.
  assert.ok(!(texts.includes('patient') && texts.includes('patient entry')));
  for (const p of L.phrases) if (!p.survivesBH) assert.equal(p.cmp!.verdict.level, 'too-early');
});

test('missed: real-time only, hindsight counted, R left, reasons, skip quality', () => {
  const xs = [
    ...Array.from({ length: 8 }, (_, i) => t({ account: 'Missed', outcome: 'Not taken', written_before_outcome: true, checklist_score: 85, would_be_r: i % 2 ? 2 : -1, skip_reason: i % 2 ? 'Fear' : 'Rule' })),
    t({ account: 'Missed', outcome: 'Not taken', written_before_outcome: false, checklist_score: 95, would_be_r: 3 }),
    ...Array.from({ length: 10 }, (_, i) => t({ checklist_score: 85, r_multiple: i % 2 ? 2 : -1 })),
  ];
  const m = missedStats(xs);
  assert.equal(m.realtime, 8); assert.equal(m.hindsightLeftOut, 1);
  assert.equal(m.wouldWin, 4); assert.equal(m.rLeft, 8);
  assert.deepEqual(m.byReason.map((r) => [r.reason, r.n]).sort(), [['Fear', 4], ['Rule', 4]]);
  assert.equal(m.read, 'hesitation');
  const low = missedStats(xs.map((x: { account: string; checklist_score: number }) => (x.account === 'Missed' ? { ...x, checklist_score: 50 + (Number(String((x as { id: string }).id).slice(1)) % 3) } : x)) as never[]);
  assert.equal(low.read, 'filter');
});

test('backtests as a prior pull a live level toward its replay mean, discounted', () => {
  const dir = field('direction')!;
  const live = Array.from({ length: 12 }, (_, i) => t({ direction: i % 2 ? 'Long' : 'Short', r_multiple: i % 2 ? 0 : 0 }));
  const bt = Array.from({ length: 40 }, (_, i) => t({ account: 'Backtest (FX Replay)', direction: i % 2 ? 'Long' : 'Short', r_multiple: i % 2 ? 2 : -1 }));
  const plain = explore(live, [dir], { halfLife: null }).rows[0];
  const lo = explore(live, [dir], { halfLife: null, backtest: { trades: bt, weight: 0.1 } }).rows[0];
  const hi = explore(live, [dir], { halfLife: null, backtest: { trades: bt, weight: 0.5 } }).rows[0];
  const long = (r: typeof plain) => (r.level === 'Long' ? r.shrunk : r.restShrunk);
  assert.ok(Math.abs(long(plain)) < 1e-9);
  assert.ok(long(lo) > 0 && long(hi) > long(lo), 'more weight, more pull');
});

test('the 037 tables: words, insights, blind grades keep updated_at, backup round-trip, rollback', async () => {
  const { getDb } = await import('../db/index');
  const E = await import('../db/edge');
  const { createTrade } = await import('../db/trades');
  const { parseTradeInput } = await import('../lib/validate');
  assert.ok(E.addThemeWord('early', "didn't wait")); assert.equal(E.addThemeWord('early', "didn't wait"), null);
  const parsed = parseTradeInput({ date: '2026-10-29T08:00', instrument: 'NQ', direction: 'Long', session: 'NY AM', reason: 'Rules-based (A+ setup)', setup_type: 'iFVG',
    htf_bias: 'With bias', premium_discount: 'Discount', target_type: 'PDH/PDL', outcome: 'Win', r_multiple: 2, account: 'Demo', status: 'Settled',
    explanation: 'x'.repeat(200), lesson: 'y'.repeat(200), screenshot_path: 'a.png' });
  const tr = createTrade((parsed as { value: never }).value);
  const before = (getDb().prepare('SELECT updated_at FROM trades WHERE id = ?').get(tr.id) as { updated_at: string }).updated_at;
  E.addBlindGrade(tr.id, 'B', 72);
  const after = getDb().prepare('SELECT updated_at, blind_grade FROM trades WHERE id = ?').get(tr.id) as { updated_at: string; blind_grade: string };
  assert.equal(after.blind_grade, 'B'); assert.equal(after.updated_at, before);
  const id = E.addInsight({ scope: 's', kind: 'anatomy', field: 'direction', level: 'Long', direction: 'positive', size: 0.4, verdict: 'hint', n_at: 40, last_trade_at: '2026-10-29T08:00' });
  E.settleInsight(id, { status: 'held', eval_n: 30, eval_size: 0.3, eval_p: 0.8 });
  assert.equal(E.listInsights()[0].status, 'held');
  const dump = E.exportEdge();
  getDb().exec('DELETE FROM theme_dictionary; DELETE FROM insights; DELETE FROM blind_grades;');
  assert.equal(E.restoreEdge(dump), 3);
  const { rollback } = await import('../db/cli-rollback');
  rollback('037', getDb());
  assert.equal((getDb().prepare("SELECT count(*) n FROM sqlite_master WHERE name IN ('insights','theme_dictionary','blind_grades')").get() as { n: number }).n, 0);
  assert.equal((getDb().prepare('SELECT count(*) n FROM trades WHERE id = ?').get(tr.id) as { n: number }).n, 1);
});
