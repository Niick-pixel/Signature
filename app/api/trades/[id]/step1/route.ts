import { NextResponse } from 'next/server';
import { editStep1 } from '@/db/trades';
import { cleanStep1Edit } from '@/lib/decision';

/** Step 1's one edit (049): the answers, given again; the decision and its clock untouched. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body: unknown = await request.json().catch(() => null);
  const check = cleanStep1Edit(body);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
  try {
    return NextResponse.json(editStep1(id, check.value));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not edit Step 1.' }, { status: 400 });
  }
}
