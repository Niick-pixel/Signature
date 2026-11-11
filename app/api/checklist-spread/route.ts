import { NextResponse } from 'next/server';
import { listTrades } from '@/db/trades';
import { countsInStats } from '@/lib/domain';
import { spread } from '@/lib/edge/quality';

/**
 * GET — the checklist boxes that are ticked on (nearly) every one of your
 * last 30 settled trades (lib/edge/quality spread): a box that always says
 * yes can't tell a good setup from a bad one. The trade form says so beside
 * the checklist; nothing is changed or blocked.
 */
export async function GET() {
  const recent = listTrades().filter(countsInStats).filter((t) => t.outcome !== 'Not taken' && t.r_multiple != null)
    .sort((a, b) => a.date.localeCompare(b.date)).slice(-30);
  const items = spread(recent).items.filter((i) => i.notFiltering).map((i) => ({ label: i.label, share: i.share, answered: i.answered }));
  return NextResponse.json({ n: recent.length, items });
}
