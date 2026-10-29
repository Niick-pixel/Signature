import { NextResponse } from 'next/server';
import { listTrades } from '@/db/trades';
import { countsInStats, isTaken } from '@/lib/domain';
import { sourceOf } from '@/lib/edge/fields';
import { similarSetups } from '@/lib/edge/similar';
import type { Trade } from '@/lib/types';

/**
 * POST { draft } — similar past setups for a draft's pre fields. The pool is
 * the draft's own world: backtests for a backtest, real accounts for a real
 * trade; missed setups never count.
 */
export async function POST(request: Request) {
  const b = await request.json().catch(() => null) as { draft?: Record<string, unknown> } | null;
  const draft = (b?.draft ?? {}) as unknown as Trade;
  const world = sourceOf(String(draft.account ?? 'Live'));
  const pool = listTrades().filter((t) => countsInStats(t) && !t.deleted_at && isTaken(t.outcome) && t.status !== 'Planned' && t.r_multiple != null)
    .filter((t) => { const s = sourceOf(t.account); return world === 'backtest' ? s === 'backtest' : s !== 'backtest' && s !== 'missed'; });
  return NextResponse.json(similarSetups({ ...draft, id: String(draft.id ?? 'draft') } as Trade, pool));
}
