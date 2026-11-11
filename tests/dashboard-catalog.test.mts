/* The Stats board end to end on a real database: every default board, every widget's select, the honesty rules. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.SIGNATURE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'signature-board-'));
process.env.SIGNATURE_MIGRATIONS_DIR = path.resolve('db/migrations');

const { getDb } = await import('../db/index');
const { genFakeTrades } = await import('../lib/edge/synthetic');
const { boardPage } = await import('../db/statsBoard');
const { registry } = await import('../lib/dashboard/catalog');
const { DEFAULT_BOARDS } = await import('../lib/dashboard/defaults');
const { problems } = await import('../lib/dashboard/layout');
type VM = import('../lib/dashboard/vm').ViewModel;

const db = getDb();
const cols = new Set((db.prepare('PRAGMA table_info(trades)').all() as Array<{ name: string }>).map((c) => c.name));
function insert(trades: ReturnType<typeof genFakeTrades>, account: string) {
  for (const t of trades) {
    const row = Object.fromEntries(Object.entries({ instrument: 'NQ', direction: 'Long', session: 'NY AM', reason: 'Rules-based (A+ setup)', setup_type: 'iFVG', htf_bias: 'With bias', premium_discount: 'Discount', target_type: 'Opposing FVG', explanation: 'x', ...t, outcome: (t.r_multiple ?? 0) > 0 ? 'Win' : (t.r_multiple ?? 0) < 0 ? 'Loss' : 'Breakeven', account, id: `${account}-${t.id}` }).filter(([k, v]) => cols.has(k) && v !== undefined)
      .map(([k, v]) => [k, typeof v === 'boolean' ? (v ? 1 : 0) : Array.isArray(v) || (v && typeof v === 'object') ? JSON.stringify(v) : v]));
    const keys = Object.keys(row);
    db.prepare(`INSERT INTO trades (${keys.join(',')}) VALUES (${keys.map((k) => '@' + k).join(',')})`).run(row as never);
  }
}

test('the catalog: every widget has help, sizes, a default size among them; ids unique', () => {
  const all = registry.all();
  assert.ok(all.length >= 45, `${all.length} widgets`);
  for (const d of all) assert.ok(d.help.length > 30 && d.sizes.includes(d.defaultSize), d.id);
});

test('the default boards are sound and fit 1440×900 (at most 7 rows)', () => {
  for (const b of DEFAULT_BOARDS) {
    assert.deepEqual(problems(b.layout, registry.supports), [], b.id);
    const rows = b.layout.tiles.reduce((m, t) => Math.max(m, t.y + { S: 2, M: 2, T: 4, L: 4, W: 1, XL: 4 }[t.size]), 0);
    assert.ok(rows <= 7, `${b.id}: ${rows} rows`);
  }
});

test('an empty journal: every board renders, every widget in its too-early state or with nothing to claim', () => {
  const p = boardPage({});
  assert.equal(p.board.id, 'overview');
  assert.equal(p.source, 'real');
  for (const s of Object.values(p.states)) assert.ok(s.vm.tooEarly || s.vm.kind === 'none' || s.vm.kind === 'text' || s.vm.kind === 'list', `${s.title}: ${s.vm.kind}`);
});

test('with trades: no widget errors, every view model crosses to the browser, every claim keeps its n', () => {
  insert(genFakeTrades(70, 3), 'Demo');
  insert(genFakeTrades(90, 7), 'Backtest (FX Replay)');
  for (const b of DEFAULT_BOARDS) for (const src of ['real', 'backtest', 'all']) {
    const p = boardPage({ board: b.id, src });
    for (const [uid, s] of Object.entries(p.states)) {
      const vm = s.vm as VM;
      assert.ok(!vm.tooEarly?.text.startsWith('This widget could not be drawn'), `${b.id}/${src}/${uid}: ${vm.tooEarly?.text}`);
      assert.doesNotThrow(() => JSON.stringify(vm), uid);
      const def = registry.get(b.layout.tiles.flatMap((t) => t.items).find((i) => i.uid === uid)!.widget)!;
      if (def.claims && !vm.tooEarly && vm.kind !== 'none' && vm.kind !== 'text') assert.ok(vm.claim && typeof vm.claim.n === 'number', `${def.id} claims without n`);
    }
  }
});

test('mixed: an All-sources widget over real and replay trades says so; Real never does', () => {
  const all = boardPage({ board: 'overview', src: 'all' });
  assert.ok(Object.values(all.states).some((s) => s.mixed));
  const real = boardPage({ board: 'overview', src: 'real' });
  assert.ok(Object.values(real.states).every((s) => !s.mixed));
});

test('a widget override shows its own scope chip; the Backtest lab reads the gap on real trades', () => {
  const p = boardPage({ board: 'backtest' });
  assert.equal(p.source, 'backtest');
  assert.equal(p.states['bt-compare.1'].scope, 'Real');
});

test('rules-followed never shows breaking a rule in the good colour', () => {
  const p = boardPage({ board: 'overview', src: 'all' });
  const vm = p.states['ov-k4.0'].vm;
  assert.equal(vm.kind, 'kpi');
  if (vm.kind === 'kpi' && vm.chart?.kind === 'bars') assert.notEqual(vm.chart.items[1].tone, 'good');
});

test('drawdown reads as a fall (negative R), and "loss" pluralises', () => {
  const p = boardPage({ board: 'execution', src: 'all' });
  const dd = p.states['ex-dd.0'].vm;
  if (dd.kind === 'kpi') assert.match(dd.value, /^(−|0\.0R)/, dd.value);
  const losses = p.states['ex-losses.0'].vm;
  if (losses.kind === 'list' && losses.summary) assert.doesNotMatch(losses.summary, /losss/);
});

test('Smart Rotate: a stack with it on gets a front pick from its widgets; one with it off gets none', async () => {
  const { getBoard, saveBoard } = await import('../db/dashboards');
  const { catalog } = await import('../db/statsBoard');
  const b = getBoard('overview', catalog)!;
  const stacks = b.layout.tiles.filter((t) => t.items.length > 1);
  const on = stacks[0];
  saveBoard({ ...b, layout: { ...b.layout, tiles: b.layout.tiles.map((t) => (t.id === on.id ? { ...t, smartRotate: true } : t)) } });
  const p = boardPage({ board: 'overview' });
  assert.ok(p.rotate[on.id], 'rotated');
  assert.ok(p.rotate[on.id].index >= 0 && p.rotate[on.id].index < on.items.length);
  for (const t of stacks.slice(1)) assert.equal(p.rotate[t.id], undefined, t.id);
  // Every widget that can raise a signal does so without throwing, over every source.
  for (const src of ['real', 'backtest', 'all']) {
    const page = boardPage({ board: 'flaws', src });
    assert.doesNotThrow(() => JSON.stringify(page.rotate));
  }
  saveBoard(b);
});

test('§9: the verdict leads with the real result on a replay-heavy All, and on a Backtest board says it is replay', () => {
  const verdictOf = (src: string) => Object.values(boardPage({ board: 'overview', src }).states).find((s) => s.title === 'In one line')!.vm as Extract<VM, { kind: 'text' }>;
  const all = verdictOf('all');
  assert.match(all.headline, /^Mostly replay — on \d+ real trades/);
  const bt = verdictOf('backtest');
  assert.match(bt.headline, /^Backtests only/);
  assert.doesNotMatch(bt.headline, /no real trades/);
  assert.ok((bt.claim?.n ?? 0) > 0, 'n is the trades the sentence is about');
  assert.notEqual(bt.tone, 'good', 'a replay result is never shown as money made');
});
