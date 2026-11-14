import { NextResponse } from 'next/server';
import { setTradeDate } from '@/db/trades';

/** When the trade happened, put right: { date: 'YYYY-MM-DDTHH:mm' }. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null) as { date?: unknown } | null;
  try {
    return NextResponse.json(setTradeDate(id, String(body?.date ?? '')));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not change the date.' }, { status: 400 });
  }
}
