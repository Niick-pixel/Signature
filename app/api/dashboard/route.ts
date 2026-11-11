import { NextResponse } from 'next/server';
import { reviewInputs } from '@/db/review';
import { listTrades } from '@/db/trades';
import { countsInStats, isHypothetical } from '@/lib/domain';
import { brokenFor, dayBreaksByTrade, fieldEras } from '@/lib/review';
import { dashboardData, dashFilter, inAccounts, inWorld, type DashFilters, type DashWorld } from '@/lib/dashboard';

/** GET ?accounts=Live,Eval|Apex-1&world=&period=&session=&dir=&today= — the Dashboard for chosen accounts and filters (the page itself serves the three unfiltered worlds). */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const today = /^\d{4}-\d{2}-\d{2}$/.test(q.get('today') ?? '') ? q.get('today')! : new Date().toLocaleDateString('en-CA');
  const keys = new Set((q.get('accounts') ?? '').split(',').map((s) => s.trim()).filter(Boolean));
  const { trades: counted, ctxFor, cfg } = reviewInputs();
  // Missed setups stay out of Stats, but the Dashboard can show them on their own.
  const trades = [...counted, ...listTrades().filter((t) => isHypothetical(t.account) && !countsInStats(t))];
  const breaks = dayBreaksByTrade(counted, ctxFor, cfg);
  const eras = fieldEras(counted);
  const list = (k: string) => (q.get(k) ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  const period = (['all', 'week', 'month', '30', '90', 'year'] as const).find((p) => p === q.get('period')) ?? 'all';
  const filter = dashFilter({ period, sessions: list('session'), dirs: list('dir') } satisfies DashFilters, today);
  const world = (['real', 'backtest', 'all'] as const).find((w) => w === q.get('world')) ?? 'real' as DashWorld;
  const inScope = (t: (typeof trades)[number]) => (keys.size ? inAccounts(t, keys) : inWorld(t, world)) && filter(t);
  const last = trades.filter(inScope).sort((a, b) => a.date.localeCompare(b.date)).slice(-20);
  const kept = last.length ? last.filter((t) => brokenFor(t, breaks, cfg, eras).length === 0).length / last.length : null;
  return NextResponse.json(dashboardData(trades, world, today, kept, keys, filter));
}
