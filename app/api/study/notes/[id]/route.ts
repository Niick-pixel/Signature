import { NextResponse } from 'next/server';
import { deleteNote, getNote, listMarks, noteTrades, updateNote } from '@/db/study';
import { listTrades } from '@/db/trades';
import { readNote } from '../../shared';

/** GET — a note with its example trades (and how they went) and its video marks. */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const note = getNote(id);
  if (!note) return NextResponse.json({ error: 'No such note.' }, { status: 404 });
  const links = noteTrades(id);
  const byId = new Map(listTrades().map((t) => [t.id, t]));
  const trades = links.map((l) => ({ ...l, trade: byId.get(l.trade_id) })).filter((x) => x.trade && !x.trade.deleted_at).map(({ role, trade: t }) => ({
    id: t!.id, role, date: t!.date, undated: t!.undated, setup: t!.setup_type, direction: t!.direction, account: t!.account, outcome: t!.outcome, r: t!.r_multiple, grade: t!.grade_letter, shot: t!.screenshot_path,
  }));
  return NextResponse.json({ note, trades, marks: listMarks(id) });
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const note = updateNote(id, readNote(await request.json().catch(() => ({})) as Record<string, unknown>));
  return note ? NextResponse.json({ note }) : NextResponse.json({ error: 'No such note.' }, { status: 404 });
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  deleteNote(id);
  return NextResponse.json({ ok: true });
}
