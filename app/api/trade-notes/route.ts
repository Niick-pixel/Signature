import { NextResponse } from 'next/server';
import { listTrades } from '@/db/trades';
import { tradeNotes } from '@/lib/tradeNotes';

export const dynamic = 'force-dynamic';

/** GET ?world=backtest|real&exclude=<trade id>&grade=<letter> — the trade form's rotating notes (lib/tradeNotes). */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const world = q.get('world') === 'backtest' ? 'backtest' : 'real';
  return NextResponse.json(tradeNotes(listTrades(), { world, exclude: q.get('exclude'), grade: q.get('grade') }));
}
