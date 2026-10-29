import { NextResponse } from 'next/server';
import { reviewInputs } from '@/db/review';
import { brokenFor, dayBreaksByTrade, fieldEras } from '@/lib/review';
import { dashboardData, inAccounts } from '@/lib/dashboard';

/** GET ?accounts=Live,Eval|Apex-1&today= — the Dashboard for chosen accounts (the page itself serves the three worlds). */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const today = /^\d{4}-\d{2}-\d{2}$/.test(q.get('today') ?? '') ? q.get('today')! : new Date().toLocaleDateString('en-CA');
  const keys = new Set((q.get('accounts') ?? '').split(',').map((s) => s.trim()).filter(Boolean));
  const { trades, ctxFor, cfg } = reviewInputs();
  const breaks = dayBreaksByTrade(trades, ctxFor, cfg);
  const eras = fieldEras(trades);
  const last = trades.filter((t) => inAccounts(t, keys)).sort((a, b) => a.date.localeCompare(b.date)).slice(-20);
  const kept = last.length ? last.filter((t) => brokenFor(t, breaks, cfg, eras).length === 0).length / last.length : null;
  return NextResponse.json(dashboardData(trades, 'all', today, kept, keys));
}
