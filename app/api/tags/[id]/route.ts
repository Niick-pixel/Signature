import { NextResponse } from 'next/server';
import { deleteGroup, deleteTag, renameGroup, renameTag } from '@/db/tags';

/** PATCH { kind: 'group' | 'tag', name } — rename. */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const b = await request.json().catch(() => ({})) as Record<string, unknown>;
  const name = typeof b.name === 'string' ? b.name.trim().slice(0, 60) : '';
  if (!name) return NextResponse.json({ error: 'A name, please.' }, { status: 400 });
  (b.kind === 'group' ? renameGroup : renameTag)(id, name);
  return NextResponse.json({ ok: true });
}

/** DELETE ?kind=group|tag — a group takes its tags (and their places on trades) with it. */
export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  (new URL(request.url).searchParams.get('kind') === 'group' ? deleteGroup : deleteTag)(id);
  return NextResponse.json({ ok: true });
}
