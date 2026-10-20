import { NextResponse } from 'next/server';
import { getTrade } from '@/db/trades';
import { reviewInputs } from '@/db/review';
import { brokenFor, dayBreaksByTrade, fieldEras } from '@/lib/review';

/** The rules one trade broke — its own and its day's. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trade = getTrade(id);
  if (!trade) return NextResponse.json({ error: 'No such trade.' }, { status: 404 });
  const { trades, ctxFor, cfg } = reviewInputs();
  return NextResponse.json({ broken: brokenFor(trade, dayBreaksByTrade(trades, ctxFor, cfg), cfg, fieldEras(trades)) });
}
