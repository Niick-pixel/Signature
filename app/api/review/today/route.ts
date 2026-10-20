import { NextResponse } from 'next/server';
import { reviewInputs } from '@/db/review';
import { allSettled, beforeYouTrade, sessionClose, sessionTrades } from '@/lib/review';

/**
 * ?today=YYYY-MM-DD (local). Before anything is logged today: the "Before you
 * trade" card. Once today's trades are all settled: the "Session close" card.
 * In between (a trade still Planned or Live): nothing.
 */
export async function GET(request: Request) {
  const today = new URL(request.url).searchParams.get('today') ?? new Date().toLocaleDateString('en-CA');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return NextResponse.json({ error: 'Expected ?today=YYYY-MM-DD.' }, { status: 400 });
  const { trades, ctxFor, cfg } = reviewInputs();
  const session = sessionTrades(trades, today);
  if (session.length === 0) return NextResponse.json({ mode: 'before', before: beforeYouTrade(trades, today, ctxFor, cfg) });
  if (allSettled(session)) return NextResponse.json({ mode: 'close', close: sessionClose(session, trades, ctxFor, cfg), trades: session.length });
  return NextResponse.json({ mode: null });
}
