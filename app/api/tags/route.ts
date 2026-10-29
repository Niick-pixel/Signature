import { NextResponse } from 'next/server';
import { createGroup, createTag, listTagGroups } from '@/db/tags';

const name = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 60) : null);

/** GET — every tag group with its tags. */
export async function GET() {
  return NextResponse.json({ groups: listTagGroups() });
}

/** POST { name } — a new group · POST { groupId, name } — a new tag in it. */
export async function POST(request: Request) {
  const b = await request.json().catch(() => ({})) as Record<string, unknown>;
  const n = name(b.name);
  if (!n) return NextResponse.json({ error: 'A name, please.' }, { status: 400 });
  if (typeof b.groupId === 'string') {
    const id = createTag(b.groupId, n);
    return id ? NextResponse.json({ id }, { status: 201 }) : NextResponse.json({ error: 'No such group.' }, { status: 404 });
  }
  return NextResponse.json({ id: createGroup(n) }, { status: 201 });
}
