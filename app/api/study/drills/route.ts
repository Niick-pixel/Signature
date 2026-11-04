import { NextResponse } from 'next/server';
import { drills } from '@/db/studyHub';
import { localDay } from '@/lib/day';

/** This week's blind re-grade set. */
export async function GET(request: Request) {
  const t = new URL(request.url).searchParams.get('today');
  return NextResponse.json(drills(t && /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : localDay()));
}
