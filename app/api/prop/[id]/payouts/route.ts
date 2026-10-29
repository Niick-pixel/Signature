import { NextResponse } from 'next/server';
import { addPayout, getPropAccount } from '@/db/prop';

/** POST { date, amount, received?, status?, note? } — log a payout. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const a = getPropAccount(id);
  if (!a) return NextResponse.json({ error: 'No such account.' }, { status: 404 });
  const b = await request.json().catch(() => ({})) as Record<string, unknown>;
  const date = typeof b.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : null;
  const amount = Number(b.amount);
  if (!date || !Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: 'A payout needs a date and an amount.' }, { status: 400 });
  const rec = b.received === '' || b.received == null ? null : Number(b.received);
  const payout = addPayout({
    account_id: id, date, amount,
    // Received defaults to the split, when the plan has one.
    received: rec != null && Number.isFinite(rec) && rec >= 0 ? rec : a.payout_split ? Math.round(amount * a.payout_split * 100) / 100 : null,
    status: ['requested', 'paid', 'denied'].includes(String(b.status)) ? b.status as 'requested' | 'paid' | 'denied' : 'paid',
    note: typeof b.note === 'string' && b.note.trim() ? b.note.trim().slice(0, 500) : null,
  });
  return NextResponse.json({ payout }, { status: 201 });
}
