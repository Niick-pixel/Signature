import { NextResponse } from 'next/server';
import { createPropAccount, getPropAccount, updatePropAccount } from '@/db/prop';
import { PRESETS } from '@/lib/prop';

/**
 * POST — the eval passed: mark it so and open its funded account, with the
 * firm's funded preset when there is one (else the eval's rules, no target).
 */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const a = getPropAccount(id);
  if (!a || a.phase !== 'eval') return NextResponse.json({ error: 'Not an evaluation.' }, { status: 400 });
  const today = new Date().toLocaleDateString('en-CA');
  if (a.status === 'active') updatePropAccount(id, { status: 'passed', ended_on: today });
  // The firm's funded plan in the same size; any size of it, scaled, failing that.
  const preset = PRESETS.find((p) => p.firm === a.firm && p.phase === 'funded' && p.rules.start_balance === a.start_balance)
    ?? PRESETS.find((p) => p.firm === a.firm && p.phase === 'funded');
  const rules = preset ? { ...preset.rules, start_balance: a.start_balance } : {
    start_balance: a.start_balance, profit_target: null, drawdown_type: a.drawdown_type, max_drawdown: a.max_drawdown, trail_lock: a.trail_lock,
    daily_loss: a.daily_loss, consistency: a.consistency, min_days: null, max_contracts: a.max_contracts, qualify_amount: a.qualify_amount,
    payout_days: a.payout_days, payout_min: a.payout_min, payout_max: a.payout_max, payout_split: a.payout_split, price: null,
  };
  const funded = createPropAccount({
    firm: a.firm, plan: preset?.plan ?? `${a.plan} (funded)`, label: a.label, phase: 'funded', journal_account: 'Funded', status: 'active',
    started_on: today, ended_on: null, from_account_id: a.id, notes: null,
  }, rules);
  return NextResponse.json({ account: funded }, { status: 201 });
}
