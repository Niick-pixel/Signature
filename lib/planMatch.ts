import { isBacktest } from './domain';
import type { PrepData } from './prep';
import type { Trade } from './types';

/**
 * Did I trade my plan? Each trade set against that morning's chart prep.
 *
 * The checklist asks whether a setup was good; this asks whether it was the
 * setup I said I would take. Three things are compared, each only when both
 * sides answered it:
 *
 *   side    "Today I take: Longs only / Shorts only / No trade today"
 *   sweep   the level swept, among "Sweep to wait for"
 *   target  the target class, against the one picked in the prep
 *   time    the entry, in New York time, against "First entry" and "Done by"
 *
 * Trades are logged in Costa Rica time (UTC−6 all year, no daylight saving);
 * the prep's times are New York's, which moves between UTC−5 and UTC−4. The
 * entry is converted through the time-zone database, so the gap is right on
 * both sides of the clock change (1 hour in winter, 2 in summer).
 *
 * Never a verdict on the trade itself and never a gate — a description, like
 * everything else here.
 */
export type PlanStatus = 'in' | 'off' | 'none';

export interface PlanMatch {
  status: PlanStatus;
  /** What differed, in words — empty unless off plan. */
  diffs: string[];
  /** What was checked and agreed. */
  agreed: string[];
}

export const PLAN_LABEL: Record<PlanStatus, string> = { in: 'In the plan', off: 'Off plan', none: 'No plan' };

const NONE: PlanMatch = { status: 'none', diffs: [], agreed: [] };

/** Costa Rica: UTC−6, no daylight saving since 1992. Where trades are logged. */
export const TRADER_UTC_OFFSET_HOURS = -6;

const NY = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** A trade's logged time (Costa Rica wall clock) as minutes past midnight in New York. */
export function nyMinutes(date: string): number | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(date);
  if (!m) return null;
  const utc = Date.parse(`${m[1]}T${m[2]}:${m[3]}:00Z`) - TRADER_UTC_OFFSET_HOURS * 3600_000;
  const [h, min] = NY.format(new Date(utc)).split(':').map(Number);
  return h * 60 + min;
}

const hhmm = (mins: number) => `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;
/** "First entry" answers, as the earliest NY minute they allow. */
const FIRST: Record<string, number> = { 'From the open (9:30)': 570, 'After 9:45': 585, 'After 10:00': 600 };
/** "Done by" answers, as the latest NY minute they allow. */
const DONE: Record<string, number> = { '11:00': 660, '11:30': 690, '12:00': 720, 'The close': 960 };

/** The prep day a trade belongs to: its local calendar day. */
export const planDay = (t: Pick<Trade, 'date'>) => t.date.slice(0, 10);

export function planMatch(
  t: Pick<Trade, 'account' | 'undated' | 'direction' | 'sweep_level' | 'target_type' | 'date'>,
  prep: PrepData | null | undefined,
): PlanMatch {
  // A replay has no morning; an undated one has no day.
  if (!prep || t.undated || isBacktest(t.account)) return NONE;
  const a = prep.answers;
  const diffs: string[] = [];
  const agreed: string[] = [];

  const side = typeof a['draw.side'] === 'string' ? a['draw.side'] : null;
  if (side) {
    const ok = side === 'Both ways'
      || (side === 'Longs only' && t.direction === 'Long')
      || (side === 'Shorts only' && t.direction === 'Short');
    if (ok) agreed.push(`side (${side.toLowerCase()})`);
    else diffs.push(side === 'No trade today'
      ? 'planned no trade today'
      : `planned ${side.toLowerCase()}, took a ${t.direction.toLowerCase()}`);
  }

  const wait = Array.isArray(a['liquidity.wait']) ? a['liquidity.wait'] : [];
  if (wait.length && t.sweep_level) {
    if (wait.includes(t.sweep_level)) agreed.push(`sweep (${t.sweep_level})`);
    else diffs.push(`swept ${t.sweep_level}, planned ${wait.join(' / ')}`);
  }

  const target = typeof a['draw.target'] === 'string' ? a['draw.target'] : null;
  if (target && t.target_type) {
    if (target === t.target_type) agreed.push(`target (${target})`);
    else diffs.push(`aimed at ${t.target_type}, planned ${target}`);
  }

  // Time: the entry in New York time against the planned window. "15 min
  // after the news" needs the release time, which the prep does not hold.
  const first = typeof a['session.first'] === 'string' ? FIRST[a['session.first']] : undefined;
  const done = typeof a['session.done'] === 'string' ? DONE[a['session.done']] : undefined;
  const at = first != null || done != null ? nyMinutes(t.date) : null;
  if (at != null) {
    if (first != null && at < first) diffs.push(`entered ${hhmm(at)} NY, planned from ${hhmm(first)}`);
    else if (done != null && at > done) diffs.push(`entered ${hhmm(at)} NY, planned done by ${hhmm(done)}`);
    else agreed.push(`time (${hhmm(at)} NY)`);
  }

  if (diffs.length) return { status: 'off', diffs, agreed };
  if (agreed.length) return { status: 'in', diffs, agreed };
  return NONE;
}

export interface PlanSplitRow { key: PlanStatus; label: string; taken: number; wins: number; losses: number; totalR: number }

/**
 * R in plan, off plan and with no plan, over trades actually taken — and
 * which differences come up most among the off-plan ones.
 */
export function planSplit(trades: Trade[], prepByDay: Map<string, PrepData>): { rows: PlanSplitRow[]; reasons: Array<[string, number]> } {
  const rows = new Map<PlanStatus, PlanSplitRow>((['in', 'off', 'none'] as const).map((k) => [k, { key: k, label: PLAN_LABEL[k], taken: 0, wins: 0, losses: 0, totalR: 0 }]));
  const reasons = new Map<string, number>();
  for (const t of trades) {
    if (t.outcome === 'Not taken' || isBacktest(t.account)) continue;
    const m = planMatch(t, prepByDay.get(planDay(t)));
    const row = rows.get(m.status)!;
    row.taken += 1;
    if (t.outcome === 'Win') row.wins += 1;
    if (t.outcome === 'Loss') row.losses += 1;
    row.totalR += t.r_multiple ?? 0;
    for (const d of m.diffs) {
      const kind = d.startsWith('planned no trade') ? 'Traded on a no-trade day'
        : d.startsWith('planned') ? 'Wrong side' : d.startsWith('swept') ? 'Different sweep'
        : d.startsWith('entered') ? 'Outside planned hours' : 'Different target';
      reasons.set(kind, (reasons.get(kind) ?? 0) + 1);
    }
  }
  return { rows: [...rows.values()], reasons: [...reasons].sort((x, y) => y[1] - x[1]) };
}
