import { NextResponse } from 'next/server';
import { deleteGoal, updateGoal } from '@/db/goals';

/** PATCH { title?, archived?, end_day? } · DELETE. */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const b = await request.json().catch(() => ({})) as Record<string, unknown>;
  updateGoal(id, {
    title: typeof b.title === 'string' && b.title.trim() ? b.title.trim().slice(0, 120) : undefined,
    archived: typeof b.archived === 'boolean' ? b.archived : undefined,
    end_day: b.end_day === null ? null : typeof b.end_day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.end_day) ? b.end_day : undefined,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  deleteGoal(id);
  return NextResponse.json({ ok: true });
}
