import { NextResponse } from 'next/server';
import { addBlindGrade } from '@/db/edge';
import { getTrade } from '@/db/trades';

const GRADES = ['A+', 'A', 'B', 'C', 'F'];

/** POST { tradeId, grade, score? } — a grade given blind (Blind Re-grade). Never changes the trade's own grade. */
export async function POST(request: Request) {
  const b = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (typeof b.tradeId !== 'string' || typeof b.grade !== 'string' || !GRADES.includes(b.grade)) return NextResponse.json({ error: 'A trade and a grade (A+, A, B, C, F).' }, { status: 400 });
  if (!getTrade(b.tradeId)) return NextResponse.json({ error: 'No such trade.' }, { status: 404 });
  const score = typeof b.score === 'number' && Number.isFinite(b.score) ? Math.round(Math.min(100, Math.max(0, b.score))) : null;
  return NextResponse.json({ id: addBlindGrade(b.tradeId, b.grade, score) }, { status: 201 });
}
