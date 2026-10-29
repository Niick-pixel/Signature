import { NextResponse } from 'next/server';
import { createGoal, goalsWithProgress, listCheckins } from '@/db/goals';
import { GOAL_KINDS, type GoalKind, type GoalParams } from '@/lib/goals';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** GET ?today — every goal with its progress, and the check-ins. */
export async function GET(request: Request) {
  const t = new URL(request.url).searchParams.get('today') ?? '';
  const today = DAY.test(t) ? t : new Date().toLocaleDateString('en-CA');
  return NextResponse.json({ goals: goalsWithProgress(today), checkins: listCheckins() });
}

/** POST { kind, params, title?, start_day?, days? } — a new goal (days: how long, or open-ended). */
export async function POST(request: Request) {
  const b = await request.json().catch(() => ({})) as Record<string, unknown>;
  const spec = GOAL_KINDS.find((k) => k.kind === b.kind);
  if (!spec) return NextResponse.json({ error: 'Which kind of goal?' }, { status: 400 });
  const raw = (b.params && typeof b.params === 'object' ? b.params : {}) as Record<string, unknown>;
  const params: GoalParams = { ...spec.defaults };
  if (Array.isArray(raw.sessions)) params.sessions = raw.sessions.filter((x): x is string => typeof x === 'string').slice(0, 5);
  if (Number(raw.n) > 0) params.n = Math.min(20, Math.round(Number(raw.n)));
  if (typeof raw.tag === 'string' && raw.tag.trim()) params.tag = raw.tag.trim().slice(0, 60);
  if (typeof raw.letter === 'string' && ['A+', 'A', 'B', 'C', 'D'].includes(raw.letter)) params.letter = raw.letter;
  if (Number(raw.minutes) > 0) params.minutes = Math.min(5000, Math.round(Number(raw.minutes)));
  const start = typeof b.start_day === 'string' && DAY.test(b.start_day) ? b.start_day : new Date().toLocaleDateString('en-CA');
  const days = Number(b.days);
  let end: string | null = null;
  if (days > 0) { const d = new Date(`${start}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + Math.round(days) - 1); end = d.toISOString().slice(0, 10); }
  const title = typeof b.title === 'string' && b.title.trim() ? b.title.trim().slice(0, 120) : spec.title(params);
  return NextResponse.json({ goal: createGoal({ kind: spec.kind as GoalKind, title, params, start_day: start, end_day: end }) }, { status: 201 });
}
