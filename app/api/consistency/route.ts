import { NextResponse } from 'next/server';
import { consistencyWeek, processOverview, setRestDay } from '@/db/consistency';
import { localDay } from '@/lib/day';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** ?today= → rings and streak (with ?from= for a range); ?week=<monday> → the weekly report. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const today = DAY.test(q.get('today') ?? '') ? q.get('today')! : localDay();
  const week = q.get('week');
  if (week && DAY.test(week)) return NextResponse.json(consistencyWeek(week, today));
  const from = q.get('from');
  return NextResponse.json(processOverview(today, from && DAY.test(from) && from <= today ? from : undefined));
}

/** { restDay: boolean } */
export async function PUT(request: Request) {
  const b = await request.json().catch(() => null) as { restDay?: unknown } | null;
  if (typeof b?.restDay !== 'boolean') return NextResponse.json({ error: 'restDay must be true or false' }, { status: 400 });
  return NextResponse.json({ restDay: setRestDay(b.restDay) });
}
