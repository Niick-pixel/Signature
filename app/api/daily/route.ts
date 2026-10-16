import { NextResponse } from 'next/server';
import { getDailyReview, listDailyReviews, saveDailyReview } from '@/db/reviews';
import { listTrades } from '@/db/trades';
import { BIAS_DIRECTIONS, NEWS_LEVELS } from '@/lib/domain';
import type { DailyReview } from '@/lib/types';
import { isBacktest } from '@/lib/domain';

const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function GET(request: Request) {
  const day = new URL(request.url).searchParams.get('day');
  if (day) {
    if (!isDay(day)) return NextResponse.json({ error: 'Expected YYYY-MM-DD.' }, { status: 400 });
    // The check-in asks with ?context=1: it also needs to know whether the
    // session has already started, so it does not interrupt one in progress.
    if (new URL(request.url).searchParams.get('context') === '1') {
      // A backtest logged this morning is not a session under way.
      const tradesToday = listTrades().filter((t) => !isBacktest(t.account) && t.date.slice(0, 10) === day).length;
      return NextResponse.json({ review: getDailyReview(day), tradesToday });
    }
    return NextResponse.json(getDailyReview(day));
  }
  return NextResponse.json(listDailyReviews());
}

/** One row per trading day, whether or not anything was traded. */
export async function PUT(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!isDay(body?.day)) return NextResponse.json({ error: 'Expected YYYY-MM-DD.' }, { status: 400 });

  const num = (v: unknown) => (v === '' || v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null);
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const clamp = (v: unknown) => {
    const n = num(v);
    return n == null ? null : Math.min(5, Math.max(1, Math.round(n)));
  };

  const pick = <T,>(v: unknown, list: readonly T[]) => (list.includes(v as T) ? v as T : null);

  // Each field only when it was sent, so the morning check-in and the evening
  // review can each save their half of the row without blanking the other's.
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);
  const fields: Partial<DailyReview> = {};
  const take = <K extends keyof DailyReview>(k: K, read: (v: unknown) => DailyReview[K]) => {
    if (has(k)) fields[k] = read(body[k]);
  };
  take('account', str);
  take('bias', str);
  take('bias_screenshot', str);
  take('planned_killzones', str);
  take('planned_levels', str);
  take('what_happened', str);
  take('bias_held', (v) => (v == null ? null : v === true));
  take('trades_planned', num);
  take('screen_minutes', num);
  take('sleep_hours', num);
  take('state_of_mind', clamp);
  take('notes', str);
  take('bias_direction', (v) => pick(v, BIAS_DIRECTIONS));
  take('news', (v) => pick(v, NEWS_LEVELS));
  take('news_note', str);
  take('working_on', str);

  return NextResponse.json(saveDailyReview(body.day as string, fields, { checkIn: body.check_in === true }));
}
