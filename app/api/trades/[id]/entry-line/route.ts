import { NextResponse } from 'next/server';
import { setEntryLine } from '@/db/edge';

/** POST { x } — mark the entry candle on the trade's screenshot (0–1 from the left); { x: null } clears it. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const b = await request.json().catch(() => ({})) as { x?: unknown };
  const x = b.x === null ? null : typeof b.x === 'number' && Number.isFinite(b.x) ? b.x : undefined;
  if (x === undefined) return NextResponse.json({ error: 'x between 0 and 1, or null.' }, { status: 400 });
  return setEntryLine(id, x) ? NextResponse.json({ ok: true, x }) : NextResponse.json({ error: 'No such trade.' }, { status: 404 });
}
