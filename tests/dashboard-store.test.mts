/* Saved boards (043): round trip, a broken or newer board never lost, export/import, reorder, the rollback. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.SIGNATURE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'signature-boards-'));
process.env.SIGNATURE_MIGRATIONS_DIR = path.resolve('db/migrations');

const D = await import('../db/dashboards');
const { getDb } = await import('../db/index');
const { defaultSettings, LAYOUT_SCHEMA } = await import('../lib/dashboard/schema');
type SizeKey = import('../lib/dashboard/types').SizeKey;

const SUP: Record<string, SizeKey[]> = { kpi: ['S', 'M'], chart: ['M', 'L'] };
const cat = { supports: (w: string) => SUP[w] ?? [], known: (w: string) => w in SUP };
const layout = { schema: 1, tiles: [{ id: 't1', x: 0, y: 0, size: 'S' as const, items: [{ uid: 'u1', widget: 'kpi', cfg: { accent: '#00aaff' } }], active: 0, smartRotate: false }] };

test('boards: seeded once, saved, read back sound; duplicate, rename, reorder, delete', () => {
  getDb();
  assert.equal(D.seedBoards([{ id: 'overview', name: 'Overview', source: 'real', layout }, { id: 'flaws', name: 'Flaws', source: 'all', layout }], defaultSettings), true);
  assert.equal(D.seedBoards([{ id: 'x', name: 'X', source: 'real', layout }], defaultSettings), false, 'never seeds over your boards');
  const all = D.listBoards(cat);
  assert.deepEqual(all.map((b) => b.id), ['overview', 'flaws']);
  assert.equal(all[0].settings.source, 'real');
  assert.equal(all[1].settings.source, 'all');
  assert.equal(all[0].layout.tiles[0].items[0].cfg.accent, '#00aaff');

  const copy = D.duplicateBoard('overview', cat)!;
  assert.equal(D.getBoard(copy, cat)!.name, 'Overview copy');
  D.renameBoard(copy, '  My board  ');
  assert.equal(D.getBoard(copy, cat)!.name, 'My board');
  D.reorderBoards([copy, 'overview', 'flaws']);
  assert.deepEqual(D.listBoards(cat).map((b) => b.id), [copy, 'overview', 'flaws']);
  D.deleteBoard(copy);
  assert.equal(D.getBoard(copy, cat), null);
});

test('a board with a widget that no longer exists loads without it; one from a newer app is read-only', () => {
  getDb().prepare('INSERT INTO dashboard_boards (id, name, position, layout_json, settings_json, schema_version) VALUES (?, ?, 9, ?, ?, 1)')
    .run('old', 'Old', JSON.stringify({ tiles: [{ id: 'a', x: 0, y: 0, size: 'S', items: [{ uid: 'u', widget: 'retired' }, { uid: 'v', widget: 'kpi' }] }] }), 'not json');
  const old = D.getBoard('old', cat)!;
  assert.deepEqual(old.dropped, ['retired']);
  assert.equal(old.layout.tiles[0].items[0].widget, 'kpi');
  assert.equal(old.settings.fit, true, 'unreadable settings take the defaults');

  getDb().prepare('INSERT INTO dashboard_boards (id, name, position, layout_json, schema_version) VALUES (?, ?, 10, ?, ?)')
    .run('future', 'Future', JSON.stringify({ tiles: [] }), LAYOUT_SCHEMA + 1);
  assert.equal(D.getBoard('future', cat)!.readOnly, true);
  assert.throws(() => D.saveBoard({ id: 'future', name: 'Future', layout, settings: defaultSettings() }), /newer version/);
});

test('export / import a board as a file: a new board, migrated; a foreign or newer file refused', () => {
  const file = D.boardFile(D.getBoard('overview', cat)!);
  assert.equal(file.format, 'signature-board');
  const back = D.importBoard(JSON.parse(JSON.stringify(file)), cat);
  assert.notEqual(back.id, 'overview');
  assert.equal(D.getBoard(back.id, cat)!.layout.tiles[0].items[0].widget, 'kpi');
  assert.equal(D.getBoard(back.id, cat)!.name, 'Overview (imported)', 'a taken name says it was imported');
  assert.throws(() => D.importBoard({ format: 'something-else' }, cat), /not a Signature board/);
  assert.throws(() => D.importBoard({ ...file, schema: LAYOUT_SCHEMA + 1 }, cat), /newer version/);
});

test('once: an install with the old boards gets the single Stats board; untouched old boards go, changed ones stay', async () => {
  const { DEFAULT_BOARDS, LEGACY_BOARDS } = await import('../lib/dashboard/defaults');
  const { registry } = await import('../lib/dashboard/catalog');
  const real = { supports: registry.supports, known: registry.known };
  const db = getDb();
  db.exec('DELETE FROM dashboard_boards'); db.prepare("DELETE FROM app_settings WHERE key = 'stats_single_board'").run();
  LEGACY_BOARDS.forEach((b, i) => D.saveBoard({ id: b.id, name: b.name, position: i, layout: b.layout, settings: defaultSettings(b.source) }));
  // One you changed: the Flaws board with its first stack moved.
  const flaws = LEGACY_BOARDS.find((b) => b.id === 'flaws')!;
  D.saveBoard({ id: 'flaws', name: 'Flaws', position: 1, layout: { ...flaws.layout, tiles: flaws.layout.tiles.map((t, i) => (i === 0 ? { ...t, smartRotate: true } : t)) }, settings: defaultSettings('all') });
  // Which widget sits in front is not a change.
  const ov = LEGACY_BOARDS[0];
  D.saveBoard({ id: 'overview', name: ov.name, position: 0, layout: { ...ov.layout, tiles: ov.layout.tiles.map((t) => ({ ...t, active: t.items.length - 1 })) }, settings: defaultSettings('real') });

  assert.equal(D.consolidateBoards(DEFAULT_BOARDS[0], LEGACY_BOARDS, real, defaultSettings), true);
  assert.deepEqual(D.listBoards(real).map((b) => b.id), ['stats', 'flaws'], 'Stats first; only the changed board kept');
  // Never again: deleting Stats later is not undone.
  D.deleteBoard('stats');
  assert.equal(D.consolidateBoards(DEFAULT_BOARDS[0], LEGACY_BOARDS, real, defaultSettings), false);
  assert.deepEqual(D.listBoards(real).map((b) => b.id), ['flaws']);
});

test('a stack holds at most 5: stacking past it is refused; a bigger saved one is split, nothing lost', async () => {
  const { stackOnto, MAX_STACK } = await import('../lib/dashboard/layout');
  const { migrateLayout } = await import('../lib/dashboard/schema');
  const sup = () => ['S'] as SizeKey[];
  const mk = (id: string, x: number, n: number) => ({ id, x, y: 0, size: 'S' as const, active: 0, smartRotate: false, items: Array.from({ length: n }, (_, i) => ({ uid: `${id}${i}`, widget: 'kpi', cfg: {} })) });
  const l = { schema: 1, tiles: [mk('a', 0, 4), mk('b', 3, 2)] };
  const r = stackOnto(l, 'b', 'a', sup);
  assert.equal(r.ok, false); assert.match(r.reason!, /up to 5/);
  assert.equal(stackOnto({ schema: 1, tiles: [mk('a', 0, 4), mk('b', 3, 1)] }, 'b', 'a', sup).ok, true);
  const m = migrateLayout({ tiles: [mk('big', 0, 7)] }, 1, sup, () => true);
  assert.equal(m.layout.tiles[0].items.length, MAX_STACK);
  assert.equal(m.layout.tiles.reduce((n, t) => n + t.items.length, 0), 7, 'the two past the limit get their own tiles');
});

test('rollback 043 drops only the boards table', async () => {
  const { rollback } = await import('../db/cli-rollback');
  rollback('043', getDb());
  const names = (getDb().prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map((r) => r.name);
  assert.ok(!names.includes('dashboard_boards'));
  assert.ok(names.includes('flaw_work') && names.includes('trades'));
});
