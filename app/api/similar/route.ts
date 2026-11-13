import { NextResponse } from 'next/server';
import { listTrades } from '@/db/trades';
import { countsInStats, isTaken } from '@/lib/domain';
import { sourceOf } from '@/lib/edge/fields';
import { similarSetups } from '@/lib/edge/similar';
import { isRubricV2 } from '@/lib/decision';

/** A Rubric v2 trade is compared with v2 trades only, and shows nothing until this many match. */
const V2_MIN_MATCHES = 10;
import type { Trade } from '@/lib/types';

/**
 * POST { draft } — similar past setups for a draft's pre fields. The pool is
 * the draft's own world: backtests for a backtest, real accounts for a real
 * trade; missed setups never count. A Rubric v2 draft is matched against
 * v2 trades only — the old checklist's trades never feed it — and until
 * ten match it gets a count, no expected R or win chance.
 */
export async function POST(request: Request) {
  const b = await request.json().catch(() => null) as { draft?: Record<string, unknown> } | null;
  const draft = (b?.draft ?? {}) as unknown as Trade;
  const world = sourceOf(String(draft.account ?? 'Live'));
  const pool = listTrades().filter((t) => countsInStats(t) && !t.deleted_at && isTaken(t.outcome) && t.status !== 'Planned' && t.r_multiple != null)
    .filter((t) => { const s = sourceOf(t.account); return world === 'backtest' ? s === 'backtest' : s !== 'backtest' && s !== 'missed'; });
  const v2 = isRubricV2(draft);
  const result = similarSetups({ ...draft, id: String(draft.id ?? 'draft') } as Trade, v2 ? pool.filter(isRubricV2) : pool);
  if (v2 && result.n < V2_MIN_MATCHES) {
    return NextResponse.json({ ...result, meanR: null, shrunkR: null, pWin: null, neighbours: [], v2: { have: result.n, need: V2_MIN_MATCHES } });
  }
  return NextResponse.json(v2 ? { ...result, v2: { have: result.n, need: V2_MIN_MATCHES } } : result);
}
