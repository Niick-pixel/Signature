import { NextResponse } from 'next/server';
import { getTrade } from '@/db/trades';
import { setTradeTags, tagsForTrade } from '@/db/tags';

/** GET — this trade's own tags (ids) · PUT { tagIds } — replace them. */
export async function GET(_r: Request, ctx: { params: Promise<{ id: string }> }) {
  return NextResponse.json({ tagIds: tagsForTrade((await ctx.params).id) });
}

export async function PUT(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!getTrade(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const b = await request.json().catch(() => ({})) as { tagIds?: unknown };
  const ids = Array.isArray(b.tagIds) ? b.tagIds.filter((x): x is string => typeof x === 'string').slice(0, 100) : [];
  return NextResponse.json({ tagIds: setTradeTags(id, ids) });
}
