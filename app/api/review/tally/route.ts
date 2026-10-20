import { NextResponse } from 'next/server';
import { reviewInputs } from '@/db/review';
import { brokenFor, dayBreaksByTrade, fieldEras, sessionTrades } from '@/lib/review';
import { isBacktest } from '@/lib/domain';

/** GET ?today=&world=backtest|real — tonight's running tally for the trade form. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const today = url.searchParams.get('today') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return NextResponse.json({ error: 'Expected ?today=YYYY-MM-DD.' }, { status: 400 });
  const backtest = url.searchParams.get('world') !== 'real';
  const { trades, ctxFor, cfg } = reviewInputs();
  const breaks = dayBreaksByTrade(trades, ctxFor, cfg);
  const eras = fieldEras(trades);
  const session = sessionTrades(trades, today).filter((t) => isBacktest(t.account) === backtest && t.status !== 'Planned')
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const counts = session.map((t) => brokenFor(t, breaks, cfg, eras).length);
  return NextResponse.json({
    trades: session.length,
    wins: session.filter((t) => t.outcome === 'Win').length,
    losses: session.filter((t) => t.outcome === 'Loss').length,
    breakeven: session.filter((t) => t.outcome === 'Breakeven' || t.outcome === 'Scratched').length,
    netR: Math.round(session.reduce((s, t) => s + (t.r_multiple ?? 0), 0) * 100) / 100,
    breaks: counts.reduce((s, n) => s + n, 0),
    recentBreaks: counts.slice(-3).reduce((s, n) => s + n, 0),
  });
}
