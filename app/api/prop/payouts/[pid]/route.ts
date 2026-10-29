import { NextResponse } from 'next/server';
import { deletePayout, updatePayoutStatus } from '@/db/prop';

/** PATCH { status, received? } — a requested payout paid or denied. */
export async function PATCH(request: Request, ctx: { params: Promise<{ pid: string }> }) {
  const { pid } = await ctx.params;
  const b = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (!['requested', 'paid', 'denied'].includes(String(b.status))) return NextResponse.json({ error: 'Status?' }, { status: 400 });
  const rec = b.received == null || b.received === '' ? null : Number(b.received);
  updatePayoutStatus(pid, b.status as 'requested' | 'paid' | 'denied', rec != null && Number.isFinite(rec) ? rec : null);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ pid: string }> }) {
  const { pid } = await ctx.params;
  deletePayout(pid);
  return NextResponse.json({ ok: true });
}
