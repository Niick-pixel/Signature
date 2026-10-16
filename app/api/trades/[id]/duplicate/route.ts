import { NextResponse } from 'next/server';
import { duplicateTrade, getTrade } from '@/db/trades';
import { guardBulkAccount } from '@/db/path';

/** A second entry on the same setup. The outcome is deliberately not copied. */
export async function POST(_r: Request, ctx: { params: Promise<{ id: string }> }) {
  const copy = duplicateTrade((await ctx.params).id);
  if (!copy) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // A new trade in a guarded account is a promise broken, copy or not.
  guardBulkAccount([copy.id], copy.account, { newTrade: true });
  return NextResponse.json(getTrade(copy.id) ?? copy, { status: 201 });
}
