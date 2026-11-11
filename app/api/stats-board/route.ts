import { NextResponse } from 'next/server';
import { getBoard, saveBoard } from '@/db/dashboards';
import { catalog } from '@/db/statsBoard';
import type { Source } from '@/lib/dashboard/types';

/**
 * POST — changes to a Stats board.
 *   { action: 'source', board, source }   the board's default source (Real / Backtest / All), remembered
 * (Phase 3 adds the editing actions: layout, settings, boards.)
 */
export async function POST(request: Request) {
  const b = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!b || typeof b.action !== 'string' || typeof b.board !== 'string') return NextResponse.json({ error: 'What should change?' }, { status: 400 });
  const board = getBoard(b.board, catalog);
  if (!board) return NextResponse.json({ error: 'No such board.' }, { status: 404 });
  if (board.readOnly) return NextResponse.json({ error: 'This board was saved by a newer version of Signature.' }, { status: 409 });
  switch (b.action) {
    case 'source': {
      if (!['real', 'backtest', 'all'].includes(b.source as string)) return NextResponse.json({ error: 'Real, Backtest or All.' }, { status: 400 });
      saveBoard({ ...board, settings: { ...board.settings, source: b.source as Source } });
      return NextResponse.json({ ok: true });
    }
    default: return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  }
}
