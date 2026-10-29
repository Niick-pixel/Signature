import { reviewInputs } from '@/db/review';
import { newsRedDays } from '@/db/news';
import { getDailyReview } from '@/db/reviews';
import { inWorld, type DashWorld } from '@/lib/dashboard';
import { analysable } from '@/lib/analytics';

/** The trades one analytics world reads, and the red-folder days (check-in or news calendar). */
export function analyticsInputs(world: string) {
  const w: DashWorld = world === 'real' || world === 'backtest' ? world : 'all';
  const { trades } = reviewInputs();
  const ts = analysable(trades.filter((t) => inWorld(t, w)));
  const fromNews = newsRedDays();
  const red = new Set<string>(fromNews);
  for (const d of new Set(ts.map((t) => t.date.slice(0, 10)))) if (getDailyReview(d)?.news === 'High') red.add(d);
  return { trades: ts, red, world: w };
}

export const num = (v: string | null, dflt: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) && v !== null && v !== '' ? Math.max(min, Math.min(max, n)) : dflt;
};
