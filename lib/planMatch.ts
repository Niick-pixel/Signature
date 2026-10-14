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
 *
 * Times (first entry, done by) are left out on purpose: the prep's are New
 * York times and the trades' are local, and a wrong time-zone guess would
 * call good trades off plan.
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

/** The prep day a trade belongs to: its local calendar day. */
export const planDay = (t: Pick<Trade, 'date'>) => t.date.slice(0, 10);

export function planMatch(
  t: Pick<Trade, 'account' | 'undated' | 'direction' | 'sweep_level' | 'target_type'>,
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
        : d.startsWith('planned') ? 'Wrong side' : d.startsWith('swept') ? 'Different sweep' : 'Different target';
      reasons.set(kind, (reasons.get(kind) ?? 0) + 1);
    }
  }
  return { rows: [...rows.values()], reasons: [...reasons].sort((x, y) => y[1] - x[1]) };
}
