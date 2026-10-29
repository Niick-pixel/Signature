import { NextResponse } from 'next/server';
import { deleteExecution, getExecution, linkExecution, unlinkExecution } from '@/db/executions';
import { getTrade } from '@/db/trades';
import { readOptions } from '../shared';

/** PATCH { tradeId: string | null, overwrite?, pnlAfterFees? } — link to a trade, or unlink (remembered). */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!getExecution(id)) return NextResponse.json({ error: 'No such execution.' }, { status: 404 });
  const b = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (b.tradeId === null) { unlinkExecution(id); return NextResponse.json({ ok: true, filled: [] }); }
  if (typeof b.tradeId !== 'string' || !getTrade(b.tradeId)) return NextResponse.json({ error: 'No such trade.' }, { status: 400 });
  const o = readOptions(b);
  return NextResponse.json({ ok: true, filled: linkExecution(id, b.tradeId, { overwrite: o.overwrite, pnlAfterFees: o.pnlAfterFees }) });
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  deleteExecution(id);
  return NextResponse.json({ ok: true });
}
