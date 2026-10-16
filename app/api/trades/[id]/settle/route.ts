import { NextResponse } from 'next/server';
import { settleTrade, updateTrade } from '@/db/trades';
import { applyRules } from '@/db/rules';
import type { TradeInput } from '@/lib/types';
import { OUTCOMES, signForOutcome, type Outcome } from '@/lib/domain';

/** Quick-settle: outcome and R only, without reopening the whole form. */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);

  if (!body || !(OUTCOMES as readonly string[]).includes(body.outcome)) {
    return NextResponse.json({ error: 'Invalid outcome.' }, { status: 400 });
  }

  const r = body.r_multiple;
  if (r !== null && r !== undefined && !Number.isFinite(Number(r))) {
    return NextResponse.json({ error: 'Invalid R multiple.' }, { status: 400 });
  }

  const updated = settleTrade(id, {
    outcome: body.outcome as Outcome,
    // A loss settled as "1" is −1R.
    r_multiple: signForOutcome(r === null || r === undefined || r === '' ? null : Number(r), body.outcome),
  });

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // The same rules as a full save: settling a low-confidence plan as taken tags it.
  const ruled = applyRules(updated as unknown as TradeInput, updated);
  if (ruled.below_min_confidence !== updated.below_min_confidence || ruled.mistake_tags.length !== updated.mistake_tags.length) {
    return NextResponse.json(updateTrade(id, ruled));
  }
  return NextResponse.json(updated);
}
