import { NextResponse } from 'next/server';
import { syncForexFactory } from '@/db/news';

/** POST { force? } — pull ForexFactory's weekly calendar now. */
export async function POST(request: Request) {
  const b = await request.json().catch(() => ({})) as Record<string, unknown>;
  return NextResponse.json(await syncForexFactory(b.force === true));
}
