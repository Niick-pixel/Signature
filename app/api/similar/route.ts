import { NextResponse } from 'next/server';
import { listTrades } from '@/db/trades';
import { countsInStats, isTaken } from '@/lib/domain';
import { sourceOf } from '@/lib/edge/fields';
import { similarInFamily } from '@/lib/edge/similar';
import { RUBRIC_V2 } from '@/lib/decision';
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
  // A draft from the decision flow is Rubric v2 even before it is saved (it is never graded under the legacy rubric).
  const rubric = draft.rubric_version ?? (draft.decision || draft.row_sweep != null ? RUBRIC_V2 : null);
  return NextResponse.json(similarInFamily({ ...draft, rubric_version: rubric, id: String(draft.id ?? 'draft') } as Trade, pool));
}
