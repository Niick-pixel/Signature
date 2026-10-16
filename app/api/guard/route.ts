import { NextResponse } from 'next/server';
import { guardContext } from '@/db/rules';

/** Live numbers for the trade form: my record below minimum confidence, on EQH/EQL, the day's losses. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const day = q.get('day');
  return NextResponse.json(guardContext(q.get('account') ?? 'Live', day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null, q.get('exclude')));
}
