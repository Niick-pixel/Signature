import { NextResponse } from 'next/server';
import { listTrades } from '@/db/trades';
import { isBacktest } from '@/lib/domain';

/**
 * GET — the replay sessions so far: the highest number, and a suggestion for
 * the next backtest — the same session when the last one was logged in the
 * past 6 hours (same evening, same replay), else a new one.
 */
export async function GET() {
  const bts = listTrades().filter((t) => isBacktest(t.account) && !t.deleted_at);
  const last = bts.reduce((m, t) => Math.max(m, t.session_index ?? 0), 0);
  const latest = [...bts].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const recent = latest && Date.now() - Date.parse(latest.created_at.endsWith('Z') ? latest.created_at : `${latest.created_at}Z`) < 6 * 3600_000;
  return NextResponse.json({ last: last || null, suggested: recent && latest.session_index ? latest.session_index : last + 1 });
}
