import { NextResponse } from 'next/server';
import { listTrades } from '@/db/trades';
import { decisionStats } from '@/lib/decisionStats';

export const dynamic = 'force-dynamic';

/** Rubric v2 trades logged before the first review. */
const FIRST_REVIEW = 20;
/** Expectancy by total is shown only from this many. */
const SHOW_NUMBERS_FROM = 10;

/**
 * GET — Rubric v2 progress for Step 2's card: how many v2 records are
 * written (decided, outcome in) toward the first review, and — from ten —
 * R per trade taken by rubric total. Before ten: the count only.
 */
export async function GET() {
  const d = decisionStats(listTrades());
  const byTotal = d.n >= SHOW_NUMBERS_FROM
    ? d.byTotal.filter((b) => b.taken.n > 0).map((b) => ({ total: b.total, n: b.taken.n, avgR: b.taken.avgR }))
    : null;
  return NextResponse.json({ logged: d.n, firstReview: FIRST_REVIEW, showFrom: SHOW_NUMBERS_FROM, byTotal });
}
