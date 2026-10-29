import { NextResponse } from 'next/server';
import { createPropAccount, propOverview } from '@/db/prop';
import { listPurchases } from '@/db/path';
import { PRESETS, propLedger, readRules } from '@/lib/prop';
import { readMeta, readView } from './shared';

/** GET ?today&boundary&warn — every prop account with where it stands, and the money ledger. */
export async function GET(request: Request) {
  const v = readView(request.url);
  const rows = propOverview(v.today, { boundary: v.boundary, warnShare: v.warnShare });
  // Every purchase counts as spent on prop firms, assigned to an account or not.
  const ledger = propLedger(listPurchases(), rows.map((r) => r.standing));
  return NextResponse.json({
    accounts: rows.map((r) => ({ account: r.account, standing: { ...r.standing, days: undefined }, costs: r.costs.reduce((s, c) => s + c.cost, 0), payouts: r.payouts.length })),
    ledger,
  });
}

/** POST { preset?: index, …meta, …rules } — a new account, from a preset's rules, with anything given on top. */
export async function POST(request: Request) {
  const b = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!b) return NextResponse.json({ error: 'Expected JSON.' }, { status: 400 });
  const preset = typeof b.preset === 'number' ? PRESETS[b.preset] : undefined;
  const base = preset ?? PRESETS[PRESETS.length - 1];
  const meta = readMeta({ firm: base.firm, plan: base.plan, phase: base.phase, journal_account: base.phase === 'funded' ? 'Funded' : 'Eval', ...b });
  const account = createPropAccount(meta, readRules(b, base.rules));
  return NextResponse.json({ account }, { status: 201 });
}
