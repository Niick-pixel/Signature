import { NextResponse } from 'next/server';
import { reviewInputs } from '@/db/review';
import { sessionStrip } from '@/lib/review';

/** GET ?today= — today's real trading for the strip on the board. */
export async function GET(request: Request) {
  const today = new URL(request.url).searchParams.get('today') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return NextResponse.json({ error: 'Expected ?today=YYYY-MM-DD.' }, { status: 400 });
  const { trades, ctxFor, cfg } = reviewInputs();
  return NextResponse.json(sessionStrip(trades, today, ctxFor(today), cfg));
}
