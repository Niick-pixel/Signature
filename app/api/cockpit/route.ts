import { NextResponse } from 'next/server';
import { cockpitState } from '@/db/cockpit';

export const dynamic = 'force-dynamic';

/** The cockpit right now (db/cockpit): today's numbers, countdowns, nudges and the morning's plans. */
export async function GET() {
  return NextResponse.json(cockpitState());
}
