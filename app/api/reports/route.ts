import { NextResponse } from 'next/server';
import { reviewInputs } from '@/db/review';
import { listExecutions } from '@/db/executions';
import { listTagGroups, tradeTagMap } from '@/db/tags';
import { getPrep } from '@/db/prep';
import { getDailyReview } from '@/db/reviews';
import { getRuleSettings } from '@/db/rules';
import { analysable } from '@/lib/analytics';
import { brokenFor, dayBreaksByTrade, fieldEras } from '@/lib/review';
import { dayGrade } from '@/lib/dayGrade';
import { stopAfterFor } from '@/lib/rules';
import { isBacktest } from '@/lib/domain';
import { tradeEntryAt } from '@/lib/executions';
import { nyMinutes } from '@/lib/planMatch';
import { pnlOf } from '@/lib/stats';
import { reportRow, type DayCell } from '@/lib/reports';

/**
 * GET — everything the Reports page counts, once: every settled trade as a
 * flat row (real and backtest; missed setups stay out), your tag groups,
 * and one cell per real trading day for the heatmap (rules kept, plan grade, R).
 */
export async function GET() {
  const { trades: all, ctxFor, cfg } = reviewInputs();
  const ts = analysable(all);
  const tags = tradeTagMap();
  const gross = new Map<string, number>();
  for (const e of listExecutions({ limit: 2000 })) if (e.trade_id && e.gross_dollars != null) gross.set(e.trade_id, e.gross_dollars);
  const rows = ts.map((t) => reportRow(t, {
    tags: tags.get(t.id) ?? [], nyMin: t.undated ? null : nyMinutes(tradeEntryAt(t)), money: pnlOf(t), execGross: gross.get(t.id) ?? null, backtest: isBacktest(t.account),
  }));

  const breaks = dayBreaksByTrade(all, ctxFor, cfg);
  const eras = fieldEras(all);
  const settings = getRuleSettings();
  const byDay = new Map<string, typeof ts>();
  for (const t of ts) if (!isBacktest(t.account) && !t.undated) byDay.set(t.date.slice(0, 10), [...(byDay.get(t.date.slice(0, 10)) ?? []), t]);
  const days: DayCell[] = [...byDay].map(([day, list]) => {
    const prep = getPrep(day)?.data ?? null;
    const g = dayGrade(day, all, prep, getDailyReview(day), stopAfterFor(prep, settings));
    const money = list.map(pnlOf).filter((v): v is number => v != null);
    return {
      day, trades: list.length, kept: list.filter((t) => brokenFor(t, breaks, cfg, eras).length === 0).length,
      netR: Math.round(list.reduce((s, t) => s + (t.r_multiple ?? 0), 0) * 100) / 100,
      money: money.length ? Math.round(money.reduce((a, b) => a + b, 0) * 100) / 100 : null, grade: g.letter, score: g.score,
    };
  }).sort((a, b) => a.day.localeCompare(b.day));

  return NextResponse.json({ rows, days, groups: listTagGroups() });
}
