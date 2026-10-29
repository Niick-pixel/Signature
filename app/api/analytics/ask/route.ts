import { NextResponse } from 'next/server';
import { ask } from '@/lib/analytics';
import { analyticsInputs, num } from '../shared';

/** POST { q, world, minN, quotes } — a question about the journal, answered from the journal. Local; no model. */
export async function POST(request: Request) {
  const b = await request.json().catch(() => null) as Record<string, unknown> | null;
  const question = typeof b?.q === 'string' ? b.q.slice(0, 300) : '';
  if (!question.trim()) return NextResponse.json({ error: 'Ask something.' }, { status: 400 });
  const { trades, red } = analyticsInputs(String(b?.world ?? 'all'));
  return NextResponse.json(ask(question, trades, { minN: num(String(b?.minN ?? ''), 5, 1, 50), quotes: num(String(b?.quotes ?? ''), 3, 0, 8) }, { red }));
}
