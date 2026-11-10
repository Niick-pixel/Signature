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
  assert.throws(() => D.importBoard({ format: 'something-else' }, cat), /not a Signature board/);
  assert.throws(() => D.importBoard({ ...file, schema: LAYOUT_SCHEMA + 1 }, cat), /newer version/);
});

test('rollback 043 drops only the boards table', async () => {
  const { rollback } = await import('../db/cli-rollback');
  rollback('043', getDb());
  const names = (getDb().prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map((r) => r.name);
  assert.ok(!names.includes('dashboard_boards'));
  assert.ok(names.includes('flaw_work') && names.includes('trades'));
});
