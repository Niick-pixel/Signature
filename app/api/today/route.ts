import { NextResponse } from 'next/server';
import { getPrep } from '@/db/prep';
import { reviewInputs } from '@/db/review';
import { PREP_STEPS, answerKey, answerText } from '@/lib/prep';
import { brokenFor, dayBreaksByTrade, fieldEras, sessionTrades } from '@/lib/review';
import { pnlOf } from '@/lib/stats';
import { dayGrade } from '@/lib/dayGrade';
import { getDailyReview } from '@/db/reviews';
import { getRuleSettings } from '@/db/rules';
import { stopAfterFor } from '@/lib/rules';
import { isHypothetical, isTaken } from '@/lib/domain';
import { analysable } from '@/lib/analytics';
import { tiltNow } from '@/lib/behaviour';

/**
 * GET ?today= — the Today panel: the morning's plan (from the chart prep),
 * the rules kept on today's trades, and the most recent trades.
 */
export async function GET(request: Request) {
  const today = new URL(request.url).searchParams.get('today') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return NextResponse.json({ error: 'Expected ?today=YYYY-MM-DD.' }, { status: 400 });
  const prep = getPrep(today);
  const plan = prep ? PREP_STEPS.flatMap((s) => s.fields.filter((f) => !f.hidden).map((f) => ({ label: f.label, value: answerText(prep.data.answers[answerKey(s, f)]) })))
    .filter((x): x is { label: string; value: string } => x.value != null) : [];
  const done = prep ? Object.values(prep.data.steps).filter((v) => v === 'done').length : 0;

  const { trades, ctxFor, cfg } = reviewInputs();
  const breaks = dayBreaksByTrade(trades, ctxFor, cfg);
  const eras = fieldEras(trades);
  const session = sessionTrades(trades, today).filter((t) => t.status !== 'Planned' && isTaken(t.outcome));
  const counts = new Map<string, number>();
  let kept = 0;
  for (const t of session) {
    const b = brokenFor(t, breaks, cfg, eras);
    if (!b.length) kept += 1;
    for (const x of b) counts.set(x.short, (counts.get(x.short) ?? 0) + 1);
  }
  const recent = trades.filter((t) => !t.deleted_at && !isHypothetical(t.account) && isTaken(t.outcome) && t.status !== 'Planned')
    .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6)
    .map((t) => ({ id: t.id, at: t.created_at, account: t.account, setup: t.setup_type, direction: t.direction, outcome: t.outcome, r: t.r_multiple, money: pnlOf(t) }));
  // The plan graded against the day (lib/dayGrade), today and the last trading days.
  const settings = getRuleSettings();
  const gradeOf = (day: string) => { const p = getPrep(day)?.data ?? null; return dayGrade(day, trades, p, getDailyReview(day), stopAfterFor(p, settings), day === today); };
  const days = [...new Set(trades.filter((t) => !t.undated && !t.deleted_at).map((t) => t.date.slice(0, 10)))].filter((d) => d < today).sort().slice(-5);
  const now = new Date();
  const real = analysable(trades).filter((t) => !t.account.startsWith('Backtest'));
  return NextResponse.json({
    tilt: tiltNow(real, today, now.getHours() * 60 + now.getMinutes()),
    grade: gradeOf(today), pastGrades: days.map((d) => { const g = gradeOf(d); return { day: d, score: g.score, letter: g.letter }; }).filter((g) => g.score != null),
    plan, prep: { done, total: PREP_STEPS.length, started: Boolean(prep) },
    rules: { trades: session.length, kept, broken: [...counts].sort((a, b) => b[1] - a[1]).map(([short, count]) => ({ short, count })) },
    recent,
  });
}
