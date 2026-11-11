import { NextResponse } from 'next/server';
import { boardFile, createBoard, deleteBoard, duplicateBoard, getBoard, importBoard, listBoards, renameBoard, reorderBoards, saveBoard } from '@/db/dashboards';
import { catalog, galleryPreviews } from '@/db/statsBoard';
import { defaultBoard } from '@/lib/dashboard/defaults';
import { problems } from '@/lib/dashboard/layout';
import { LAYOUT_SCHEMA, defaultSettings, migrateLayout, migrateSettings } from '@/lib/dashboard/schema';
import type { Source } from '@/lib/dashboard/types';

/**
 * The Stats boards' changes (the dashboard in Stats; the home Dashboard tab
 * has its own /api/dashboard).
 *
 * POST { action, … }
 *   source    { board, source }            the board's default source, remembered
 *   layout    { board, layout }            the grid after an edit (repaired, then checked; a broken one is refused)
 *   settings  { board, settings }          the board's look
 *   create    { name, from? }              a new board, empty or a copy of `from`
 *   rename    { board, name }
 *   duplicate { board }
 *   delete    { board }                    never the last one
 *   reorder   { ids }
 *   reset     { board }                    a default board back to how it shipped
 *   import    { file }                     a board file, as a new board
 * GET ?export=<id>   the board as a file      ?preview=<id>&src=…   every widget over that board's scope (the gallery)
 */
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const SOURCES = ['real', 'backtest', 'all'];

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const exp = q.get('export');
  if (exp) {
    const b = getBoard(exp, catalog);
    if (!b) return bad('No such board.', 404);
    const name = b.name.replace(/[^\w -]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'board';
    return new NextResponse(JSON.stringify(boardFile(b), null, 2), {
      headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="signature-board-${name}.json"` },
    });
  }
  if (q.has('preview')) return NextResponse.json(galleryPreviews({ ...Object.fromEntries(q.entries()), board: q.get('preview') ?? undefined }));
  return bad('Ask for ?export= or ?preview=.');
}

export async function POST(request: Request) {
  const b = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!b || typeof b.action !== 'string') return bad('What should change?');
  const id = typeof b.board === 'string' ? b.board : null;
  const board = id ? getBoard(id, catalog) : null;
  const needBoard = !['create', 'reorder', 'import'].includes(b.action);
  if (needBoard && !board) return bad('No such board.', 404);
  if (board?.readOnly && b.action !== 'delete') return bad('This board was saved by a newer version of Signature.', 409);

  switch (b.action) {
    case 'source': {
      if (!SOURCES.includes(b.source as string)) return bad('Real, Backtest or All.');
      saveBoard({ ...board!, settings: { ...board!.settings, source: b.source as Source } });
      return NextResponse.json({ ok: true });
    }
    case 'layout': {
      // Repaired as a stored board would be, then refused if it still isn't sound or lost a widget.
      const m = migrateLayout(b.layout, LAYOUT_SCHEMA, catalog.supports, catalog.known);
      if (m.dropped.length) return bad(`Unknown widget: ${m.dropped.join(', ')}.`);
      const p = problems(m.layout, catalog.supports);
      if (p.length) return bad(p[0]);
      saveBoard({ ...board!, layout: m.layout });
      return NextResponse.json({ ok: true, layout: m.layout });
    }
    case 'settings': {
      saveBoard({ ...board!, settings: migrateSettings(b.settings, board!.settings.source) });
      return NextResponse.json({ ok: true });
    }
    case 'create': {
      const from = typeof b.from === 'string' ? getBoard(b.from, catalog) : null;
      const name = typeof b.name === 'string' && b.name.trim() ? b.name : 'New board';
      const newId = createBoard(name, from ? from.layout : { schema: LAYOUT_SCHEMA, tiles: [] }, from ? from.settings : defaultSettings('real'));
      return NextResponse.json({ ok: true, id: newId });
    }
    case 'rename': {
      if (typeof b.name !== 'string' || !b.name.trim()) return bad('A board needs a name.');
      renameBoard(id!, b.name);
      return NextResponse.json({ ok: true });
    }
    case 'duplicate': return NextResponse.json({ ok: true, id: duplicateBoard(id!, catalog) });
    case 'delete': {
      if (listBoards(catalog).length <= 1) return bad('Stats needs at least one board.', 409);
      deleteBoard(id!);
      return NextResponse.json({ ok: true });
    }
    case 'reorder': {
      if (!Array.isArray(b.ids) || !b.ids.every((x) => typeof x === 'string')) return bad('Which order?');
      reorderBoards(b.ids as string[]);
      return NextResponse.json({ ok: true });
    }
    case 'reset': {
      const d = defaultBoard(id!);
      if (!d) return bad('This is one of your own boards: it has no default to go back to.', 409);
      saveBoard({ id: d.id, name: d.name, layout: d.layout, settings: defaultSettings(d.source) });
      return NextResponse.json({ ok: true });
    }
    case 'import': {
      try { return NextResponse.json({ ok: true, ...importBoard(b.file, catalog) }); } catch (e) { return bad((e as Error).message); }
    }
    default: return bad('Unknown action.');
  }
}
