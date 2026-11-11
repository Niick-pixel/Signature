/* The Stats dashboard's pure core: layout, sizes, stacks, schema migration, the stack's wheel, the registry. */
import test from 'node:test';
import assert from 'node:assert/strict';
const L = await import('../lib/dashboard/layout');
const S = await import('../lib/dashboard/schema');
const G = await import('../lib/dashboard/stackGesture');
const { Registry, withDefaults, scopeFor } = await import('../lib/dashboard/registry');
type Tile = import('../lib/dashboard/types').Tile;
type SizeKey = import('../lib/dashboard/types').SizeKey;

// A tiny catalog: a KPI (S, M), a chart (M, L), a list (T, L), a strip (W).
const SUP: Record<string, SizeKey[]> = { kpi: ['S', 'M'], chart: ['M', 'L'], list: ['T', 'L'], strip: ['W'], flaw: ['M', 'L'] };
const supports = (w: string) => SUP[w] ?? [];
const tile = (id: string, x: number, y: number, size: SizeKey, ...widgets: string[]): Tile =>
  ({ id, x, y, size, items: widgets.map((w, i) => ({ uid: `${id}-${i}`, widget: w, cfg: {} })), active: 0, smartRotate: false });
const board = (...tiles: Tile[]) => ({ schema: 1, tiles });
const at = (l: { tiles: Tile[] }, id: string) => { const t = l.tiles.find((x) => x.id === id)!; return [t.x, t.y, t.size]; };

test('tiles fall up to close gaps; a moved tile pushes the ones it lands on down', () => {
  const l = board(tile('a', 0, 0, 'S', 'kpi'), tile('b', 3, 0, 'S', 'kpi'), tile('c', 0, 5, 'M', 'chart'));
  assert.deepEqual(at({ tiles: L.compact(l.tiles) }, 'c'), [0, 2, 'M'], 'c falls under a');
  const r = L.moveTile(l, 'c', 0, 0);
  assert.ok(r.ok);
  assert.deepEqual(at(r.layout, 'c'), [0, 0, 'M']);
  assert.deepEqual(at(r.layout, 'a'), [0, 2, 'S']);
  assert.deepEqual(at(r.layout, 'b'), [3, 2, 'S']);
  assert.deepEqual(L.problems(r.layout, supports), []);
  // Snapped and kept inside the 12 columns.
  assert.deepEqual(at(L.moveTile(l, 'c', 10.4, 0.6).layout, 'c'), [6, 0, 'M']);
});

test('resize only to sizes every widget in the tile has; the drag handle snaps to the nearest', () => {
  const l = board(tile('a', 0, 0, 'S', 'kpi'), tile('b', 6, 0, 'M', 'chart'));
  assert.equal(L.resizeTile(l, 'a', 'L', supports).ok, false);
  const r = L.resizeTile(l, 'a', 'M', supports);
  assert.ok(r.ok);
  assert.deepEqual(at(r.layout, 'a'), [0, 0, 'M']);
  assert.equal(L.snapSize(5, 3, ['M', 'L']), 'M');
  assert.equal(L.snapSize(6, 4, ['M', 'L']), 'L');
  assert.equal(L.snapSize(9, 9, ['S']), 'S');
  assert.equal(L.stepSize('S', ['S', 'M'], 1), 'M');
  assert.equal(L.stepSize('S', ['S', 'M'], -1), 'S');
  // A stack can only take the sizes all its widgets share.
  assert.deepEqual(L.tileSizes(tile('x', 0, 0, 'M', 'kpi', 'chart'), supports), ['M']);
});

test('stack: drop onto a tile of a size it supports; reorder keeps the front; unstack; remove', () => {
  const l = board(tile('a', 0, 0, 'M', 'chart'), tile('b', 6, 0, 'M', 'kpi'), tile('c', 0, 2, 'T', 'list'));
  assert.equal(L.stackOnto(l, 'c', 'a', supports).ok, false, 'a list has no M layout');
  const s = L.stackOnto(l, 'b', 'a', supports);
  assert.ok(s.ok);
  const a = s.layout.tiles.find((t) => t.id === 'a')!;
  assert.deepEqual(a.items.map((i) => i.widget), ['chart', 'kpi']);
  assert.equal(a.active, 1, 'the dropped widget is in front');
  assert.equal(s.layout.tiles.length, 2);
  const r = L.reorderStack(s.layout, 'a', 1, 0);
  assert.equal(r.layout.tiles.find((t) => t.id === 'a')!.active, 0, 'still the kpi in front, now first');
  const u = L.unstack(s.layout, 'a', 'b-0', 'new');
  assert.ok(u.ok);
  assert.equal(u.layout.tiles.find((t) => t.id === 'a')!.items.length, 1);
  assert.equal(u.layout.tiles.find((t) => t.id === 'new')!.size, 'M');
  assert.deepEqual(L.problems(u.layout, supports), []);
  const d = L.removeWidget(u.layout, 'new', 'b-0');
  assert.ok(!d.layout.tiles.some((t) => t.id === 'new'), 'a tile left empty goes');
});

test('new widgets go in the first free spot; only to a size they have', () => {
  const l = board(tile('a', 0, 0, 'S', 'kpi'));
  const r = L.addWidget(l, { uid: 'n', widget: 'kpi', cfg: {} }, 'S', 'n', supports);
  assert.deepEqual(at(r.layout, 'n'), [3, 0, 'S']);
  assert.equal(L.addWidget(l, { uid: 'n', widget: 'kpi', cfg: {} }, 'XL', 'n', supports).ok, false);
});

test('problems: overlap, outside the grid, a widget at a size it lacks, an empty stack', () => {
  const bad = board(tile('a', 0, 0, 'M', 'chart'), tile('b', 3, 1, 'S', 'kpi'), tile('c', 10, 0, 'S', 'list'), { ...tile('d', 0, 9, 'S'), items: [] });
  const p = L.problems(bad, supports).join('\n');
  assert.match(p, /a and b overlap/);
  assert.match(p, /c is outside/);
  assert.match(p, /list has no S layout/);
  assert.match(p, /d is empty/);
});

test('fit to screen: the row height that fits, and the overflow flag below the minimum', () => {
  assert.deepEqual(L.fitRows(770, 7, 12), { rowH: 99, overflow: false });
  assert.deepEqual(L.fitRows(300, 7, 12, 56), { rowH: 56, overflow: true });
  assert.equal(L.rowsUsed(board(tile('a', 0, 0, 'W', 'strip'), tile('b', 0, 1, 'L', 'chart'))), 5);
});

test('schema: a renamed widget maps forward, an unknown one is dropped and named, bad tiles are repaired', () => {
  const known = (w: string) => w in SUP;
  const raw = { tiles: [
    { id: 'a', x: 0, y: 0, size: 'M', items: [{ uid: 'u1', widget: 'old-chart', cfg: { accent: '#ff0000' } }, { uid: 'u2', widget: 'gone' }], active: 5 },
    { id: 'b', x: 11, y: 0, size: 'S', items: [{ uid: 'u3', widget: 'kpi' }] },            // off the right edge
    { id: 'c', x: 0, y: 0, size: 'Z', items: [{ uid: 'u4', widget: 'list' }] },             // unknown size, overlapping
    { id: 'd', x: 6, y: 9, size: 'L', items: [{ uid: 'u5', widget: 'kpi' }, { uid: 'u6', widget: 'list' }] }, // no common size
    'nonsense',
  ] };
  const m = S.migrateLayout(raw, 1, supports, known, { 'old-chart': 'chart' });
  assert.deepEqual(m.dropped, ['gone']);
  assert.ok(m.repaired);
  assert.equal(m.readOnly, false);
  assert.deepEqual(L.problems(m.layout, supports), [], 'whatever came in, a sound layout comes out');
  const a = m.layout.tiles.find((t) => t.id === 'a')!;
  assert.equal(a.items[0].widget, 'chart');
  assert.equal(a.items[0].cfg.accent, '#ff0000', 'settings survive a rename');
  assert.equal(a.active, 0);
  assert.equal(m.layout.tiles.find((t) => t.id === 'b')!.x, 9);
  assert.equal(m.layout.tiles.find((t) => t.id === 'c')!.size, 'T');
  // The kpi and the list share no size: neither is lost.
  const widgets = m.layout.tiles.flatMap((t) => t.items.map((i) => i.widget)).sort();
  assert.deepEqual(widgets, ['chart', 'kpi', 'kpi', 'list', 'list']);
  // A board from a newer app is read, flagged, never overwritten.
  assert.equal(S.migrateLayout({ tiles: [] }, S.LAYOUT_SCHEMA + 1, supports, known).readOnly, true);
  // Garbage in: an empty board, not a crash.
  assert.deepEqual(S.migrateLayout('{{', 1, supports, known).layout.tiles, []);
});

test('settings: missing or out-of-range values take the default', () => {
  const s = S.migrateSettings({ source: 'backtest', gap: 400, theme: 'neon', accent: '#12abef', semantic: { good: 'javascript:alert(1)' } });
  assert.equal(s.source, 'backtest');
  assert.equal(s.gap, 12);
  assert.equal(s.theme, 'system');
  assert.equal(s.accent, '#12abef');
  assert.equal(s.semantic.good, 'outcome-win');
  assert.equal(S.migrateSettings(null, 'real').fit, true);
});

test('stack wheel: one widget per flick, locked while it lands, bounces at the ends', () => {
  let s = G.initialStack(3);
  let r = G.stackWheel(s, { deltaY: 30, now: 0 });
  assert.equal(r.action, 'held');
  r = G.stackWheel(r.state, { deltaY: 40, now: 10 });
  assert.equal(r.action, 'switched'); assert.equal(r.state.index, 1);
  // The rest of the same flick lands in the lock.
  for (let t = 20; t < 400; t += 16) r = G.stackWheel(r.state, { deltaY: 50, now: t });
  assert.equal(r.state.index, 1);
  s = G.stackReducer(r.state, { type: 'jump', index: 2 });
  r = G.stackWheel({ ...s, lockedUntil: 0 }, { deltaY: 100, now: 1000 });
  assert.equal(r.state.index, 2); assert.equal(r.state.bounce, 1, 'past the end: a bounce, not a wrap');
});

test('stack wheel: a list scrolls first; at its edge only a fresh flick switches; the rail always switches', () => {
  const s = G.initialStack(2);
  const mid = { atTop: false, atBottom: false };
  const bottom = { atTop: false, atBottom: true };
  let r = G.stackWheel(s, { deltaY: 120, now: 0, inner: mid });
  assert.equal(r.action, 'inner');
  // The momentum that reached the bottom keeps coming: absorbed, never a switch.
  for (let t = 16; t < 600; t += 16) { r = G.stackWheel(r.state, { deltaY: 80, now: t, inner: bottom }); assert.notEqual(r.action, 'switched'); }
  // Still, then a new flick: it switches.
  r = G.stackWheel(r.state, { deltaY: 80, now: 600 + G.EDGE_PAUSE_MS + 1, inner: bottom });
  assert.equal(r.action, 'switched');
  // A list at its top: scrolling up (a fresh flick) goes back one widget; scrolling down scrolls the list.
  const top = { atTop: true, atBottom: false };
  const up = G.stackWheel(G.initialStack(2, 1), { deltaY: -80, now: 0, inner: top });
  assert.equal(up.action, 'switched'); assert.equal(up.state.index, 0);
  assert.equal(G.stackWheel(G.initialStack(2, 1), { deltaY: 80, now: 0, inner: top }).action, 'inner');
  // Over the rail, the list is ignored.
  assert.equal(G.stackWheel(s, { deltaY: 80, now: 0, inner: mid, onRail: true }).action, 'switched');
});

test('registry: ids unique, default size among the sizes, help required; defaults and scope chips', () => {
  const reg = new Registry();
  const base = { title: 'X', category: 'kpi' as const, kind: 'kpi' as const, settings: { chartStyles: ['line', 'area'] as const, scope: true, fields: [{ key: 'win', label: 'Window', kind: 'number' as const, min: 5, max: 100, step: 5, default: 20 }] }, select: () => 1, help: 'Help.' };
  reg.add({ ...base, id: 'x', sizes: ['S', 'M'], defaultSize: 'S' });
  assert.throws(() => reg.add({ ...base, id: 'x', sizes: ['S'], defaultSize: 'S' }), /twice/);
  assert.throws(() => reg.add({ ...base, id: 'y', sizes: ['S'], defaultSize: 'L' }), /default size/);
  assert.throws(() => reg.add({ ...base, id: 'z', sizes: ['S'], defaultSize: 'S', help: ' ' }), /help/);
  assert.deepEqual(reg.supports('x'), ['S', 'M']);
  assert.equal(reg.forSize('L').length, 0);
  const cfg = withDefaults(reg.get('x')!, { chartStyle: 'bars' });
  assert.equal(cfg.chartStyle, 'line', 'a style it cannot draw falls back to its default');
  assert.equal(cfg.extra!.win, 20);
  const mixedOf = (s: string) => s === 'all';
  assert.deepEqual(scopeFor({ source: 'real', period: 'all' }, {}, true, mixedOf), { source: 'real', period: 'all', lastN: null, mixed: false, override: null });
  const o = scopeFor({ source: 'real', period: 'all' }, { source: 'all', lastN: 50 }, true, mixedOf);
  assert.equal(o.override, 'All · last 50');
  assert.equal(o.mixed, true, 'the mixed chip follows the scope, whatever the widget settings say');
  assert.equal(scopeFor({ source: 'real', period: 'all' }, { source: 'all' }, false, mixedOf).override, null, 'no override where the widget does not allow it');
});

test('history: undo, redo, a new change drops the redo branch, no-op changes are not steps, capped', async () => {
  const H = await import('../lib/dashboard/history');
  let h = H.historyOf(1);
  h = H.push(h, 2); h = H.push(h, 3);
  h = H.undo(h); assert.equal(h.present, 2);
  h = H.undo(h); assert.equal(h.present, 1);
  assert.equal(H.undo(h).present, 1, 'nothing before the start');
  h = H.redo(h); assert.equal(h.present, 2);
  h = H.push(h, 9); assert.equal(H.canRedo(h), false);
  assert.equal(H.push(h, 9), h, 'the same value is not a step');
  let big = H.historyOf(0);
  for (let i = 1; i <= 150; i++) big = H.push(big, i);
  assert.equal(big.past.length, H.LIMIT);
});
