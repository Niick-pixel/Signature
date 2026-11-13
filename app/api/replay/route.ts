import { NextResponse } from 'next/server';
import { activeReplayDay, amendReplayDay, redateReplayDay, closeReplayDay, lastReplayDay, listReplayDays, lockReplayDay } from '@/db/replay';
import { listTrades } from '@/db/trades';
import { DAY_OUTCOMES, TOOK, lockMissing, parseContext, parseScenarios, type DayOutcome, type Took } from '@/lib/replay';

export const dynamic = 'force-dynamic';

/**
 * GET — the replay day being traded (active), the last one (for "Copy last
 * day" and the next date), recent days, and the active day's trades (for
 * "Did I take it?").
 * POST — { action: 'lock', replay_date, instrument, context, scenarios } "Lock & play"
 *        { action: 'amend', id, context, scenarios }
 *        { action: 'close', id, outcome, took_a, took_b, ends_sitting }
 */
export async function GET() {
  const active = activeReplayDay();
  const trades = active
    ? listTrades({ pending: true }).filter((t) => t.replay_day_id === active.id && !t.deleted_at).map((t) => ({ id: t.id, plan_scenario: t.plan_scenario, decision: t.decision, r: t.r_multiple }))
    : [];
  return NextResponse.json({ active, last: lastReplayDay(), days: listReplayDays().slice(-30).reverse(), trades });
}

export async function POST(request: Request) {
  const b = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!b || typeof b.action !== 'string') return NextResponse.json({ error: 'What should happen?' }, { status: 400 });
  try {
    if (b.action === 'lock' || b.action === 'amend') {
      const context = parseContext(b.context);
      const scenarios = parseScenarios(b.scenarios, context);
      const missing = lockMissing(context, scenarios);
      if (missing.length) return NextResponse.json({ error: `Still to tap: ${missing.join(', ')}.` }, { status: 400 });
      if (b.action === 'lock') {
        return NextResponse.json(lockReplayDay({ replay_date: String(b.replay_date ?? ''), instrument: typeof b.instrument === 'string' ? b.instrument : null, context, scenarios }));
      }
      return NextResponse.json(amendReplayDay(String(b.id ?? ''), context, scenarios));
    }
    if (b.action === 'redate') return NextResponse.json(redateReplayDay(String(b.id ?? ''), String(b.replay_date ?? '')));
    if (b.action === 'close') {
      const outcome = (DAY_OUTCOMES as readonly string[]).includes(b.outcome as string) ? b.outcome as DayOutcome : null;
      if (!outcome) return NextResponse.json({ error: 'What played out today?' }, { status: 400 });
      const took = (v: unknown) => ((TOOK as readonly string[]).includes(v as string) ? v as Took : null);
      return NextResponse.json(closeReplayDay(String(b.id ?? ''), { outcome, took_a: took(b.took_a), took_b: took(b.took_b), ends_sitting: b.ends_sitting === true }));
    }
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not save the replay day.' }, { status: 400 });
  }
}
