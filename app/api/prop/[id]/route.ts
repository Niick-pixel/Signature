import { NextResponse } from 'next/server';
import { deletePropAccount, getPropAccount, listPayouts, propOverview, updatePropAccount } from '@/db/prop';
import { readRules } from '@/lib/prop';
import { readMeta, readView } from '../shared';

/** GET ?today&boundary&warn — one account: rules, standing (with every day), trades, payouts, costs. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const v = readView(request.url);
  const row = propOverview(v.today, { boundary: v.boundary, warnShare: v.warnShare }).find((r) => r.account.id === id);
  if (!row) return NextResponse.json({ error: 'No such account.' }, { status: 404 });
  return NextResponse.json({
    ...row,
    trades: row.trades.map((t) => ({ id: t.id, date: t.date, setup: t.setup_type, direction: t.direction, instrument: t.instrument, contracts: t.contracts, outcome: t.outcome, r: t.r_multiple, pnl: t.pnl_dollars, label: t.account_label })),
  });
}

/** PATCH — any account field or rule. */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const a = getPropAccount(id);
  if (!a) return NextResponse.json({ error: 'No such account.' }, { status: 404 });
  const b = await request.json().catch(() => ({})) as Record<string, unknown>;
  // Ending an account dates it, unless a date was given.
  if (typeof b.status === 'string' && b.status !== 'active' && a.status === 'active' && !('ended_on' in b)) b.ended_on = new Date().toLocaleDateString('en-CA');
  if (b.status === 'active' && !('ended_on' in b)) b.ended_on = null;
  return NextResponse.json({ account: updatePropAccount(id, { ...readMeta(b, a), ...readRules(b, a) }) });
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  deletePropAccount(id);
  return NextResponse.json({ ok: true, payoutsLeft: listPayouts(id).length });
}
