import { NextResponse } from 'next/server';
import { saveCheckin } from '@/db/goals';

/** POST { goal_id, week, rating?, note? } — this week's word on a goal. */
export async function POST(request: Request) {
  const b = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (typeof b.goal_id !== 'string' || typeof b.week !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.week)) return NextResponse.json({ error: 'Which goal and week?' }, { status: 400 });
  const rating = Number(b.rating);
  saveCheckin({ goal_id: b.goal_id, week: b.week, rating: rating >= 1 && rating <= 5 ? Math.round(rating) : null,
    note: typeof b.note === 'string' && b.note.trim() ? b.note.trim().slice(0, 1000) : null });
  return NextResponse.json({ ok: true });
}
