import { NextResponse } from 'next/server';
import { getNote, linkTrade, unlinkTrade } from '@/db/study';

/** POST { tradeId, role } — an example (or counter-example) trade for the note. DELETE ?trade= — remove it. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!getNote(id)) return NextResponse.json({ error: 'No such note.' }, { status: 404 });
  const b = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (typeof b.tradeId !== 'string') return NextResponse.json({ error: 'Which trade?' }, { status: 400 });
  linkTrade(id, b.tradeId, b.role === 'counter' ? 'counter' : 'example');
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const trade = new URL(request.url).searchParams.get('trade');
  if (trade) unlinkTrade(id, trade);
  return NextResponse.json({ ok: true });
}
