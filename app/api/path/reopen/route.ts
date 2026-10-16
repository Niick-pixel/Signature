import { NextResponse } from 'next/server';
import { reopenStep, syncPath } from '@/db/path';

/** Reopen a finished step (and every step after it). */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { id?: unknown } | null;
  if (typeof body?.id !== 'string') return NextResponse.json({ error: 'Which step?' }, { status: 400 });
  reopenStep(body.id);
  return NextResponse.json({ steps: syncPath() });
}
