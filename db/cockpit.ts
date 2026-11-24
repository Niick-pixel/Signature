import 'server-only';
import { getDb } from './index';
import { listTrades } from './trades';
import { getPrep } from './prep';
import { getDailyReview } from './reviews';
import { getRuleSettings } from './rules';
import { getNewsSettings, listNews } from './news';
import { stopAfterFor } from '../lib/rules';
import { isReal, isTaken, marketDay, type Outcome } from '../lib/domain';
import { lossKnownAt } from '../lib/ruleBook';
import { nyMinutes } from '../lib/planMatch';
import { localDay, localStamp } from '../lib/day';
import { sessionNews } from '../lib/news';
import { countdowns, nudges, type Nudge } from '../lib/nudges';
import { scenarioLine, scenarioC, gradeCeiling, type Answer } from '../lib/prep';

export interface CockpitState {
  day: string; nowNy: number;
  today: { trades: number; maxTrades: number | null; losses: number; stopAfter: number; r: number };
  countdowns: ReturnType<typeof countdowns>;
  nudges: Nudge[];
  plans: Array<{ k: 'a' | 'b'; dir: string | null; line: string | null; ceiling: string | null }> | null;
  scenarioC: string | null;
}

const hhmm = (v: unknown): number | null => {
  const m = typeof v === 'string' ? /^(\d{1,2}):(\d{2})$/.exec(v) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/**
 * The cockpit right now: today's real-account trades against the day's rules, the countdowns and the
 * nudges (lib/nudges), and the morning's plans. Each stop or warn nudge is logged the first time it
 * shows (nudge_log), so it can be read later whether it changed anything.
 */
export function cockpitState(now = new Date()): CockpitState {
  const day = localDay(now);
  const nowLocal = localStamp(now).slice(0, 16);
  const nowNy = nyMinutes(nowLocal) ?? 0;
  const prep = getPrep(day)?.data ?? null;
  const answers = (prep?.answers ?? {}) as Record<string, Answer>;
  const review = getDailyReview(day);
  const stopAfter = stopAfterFor(prep, getRuleSettings());
  const trades = listTrades()
    .filter((t) => isReal(t.account) && !t.deleted_at && marketDay(t) === day && isTaken(t.outcome as Outcome) && t.status !== 'Planned')
    .sort((a, b) => a.date.localeCompare(b.date));
  const s = getNewsSettings();
  const news = sessionNews(listNews(day, day), day, s.currencies, s.window, nyMinutes)
    .map((e) => ({ ny: nyMinutes(e.at.slice(0, 16)) ?? -1, title: `${e.currency} ${e.title}`, impact: e.impact }))
    .filter((e) => e.ny >= 0);
  const cutoffNy = hhmm(answers['plans.cutoffAt']) ?? hhmm(answers['plans.cutoff']);
  const list = nudges({
    nowLocal, nowNy, stopAfter, maxTrades: review?.trades_planned ?? null, cutoffNy, news,
    trades: trades.map((t) => ({ id: t.id, date: t.date.slice(0, 16), outcome: t.outcome, r_multiple: t.r_multiple, contracts: t.contracts ?? null, lossAt: t.outcome === 'Loss' ? lossKnownAt(t) : null })),
  });
  logNudges(day, list);
  const has = (k: 'a' | 'b') => typeof answers[`plans.${k}Dir`] === 'string' || Array.isArray(answers[`plans.${k}Zones`]);
  return {
    day, nowNy,
    today: { trades: trades.length, maxTrades: review?.trades_planned ?? null, losses: trades.filter((t) => t.outcome === 'Loss').length, stopAfter,
      r: Math.round(trades.reduce((x, t) => x + (t.r_multiple ?? 0), 0) * 100) / 100 },
    countdowns: countdowns(nowNy, cutoffNy, news),
    nudges: list,
    plans: has('a') || has('b') ? (['a', 'b'] as const).map((k) => ({ k, dir: typeof answers[`plans.${k}Dir`] === 'string' ? answers[`plans.${k}Dir`] as string : null, line: scenarioLine(answers, k), ceiling: gradeCeiling(answers, k) })) : null,
    scenarioC: has('a') || has('b') ? scenarioC(answers) : null,
  };
}

/** The first time a stop or warn nudge shows today, it is written down (a note is not). */
function logNudges(day: string, list: readonly Nudge[]): void {
  const ins = getDb().prepare('INSERT OR IGNORE INTO nudge_log (day, key, kind, level, text) VALUES (?, ?, ?, ?, ?)');
  for (const n of list) if (n.level !== 'note') ins.run(day, n.key, n.kind, n.level, n.text);
}

/** The nudges logged, newest first (for the review: did a stop change anything?). */
export function listNudgeLog(limit = 200): Array<{ day: string; key: string; kind: string; level: string; text: string; first_at: string }> {
  return getDb().prepare('SELECT * FROM nudge_log ORDER BY first_at DESC LIMIT ?').all(limit) as never;
}
