import { isBacktest } from './domain';
import { DAY_OUTCOMES, DAY_OUTCOME_LABEL, playedOf, type DayOutcome, type ReplayDay } from './replay';
import type { Trade } from './types';

/*
  Replay plans in Stats (backtests only). A day is read by its locked
  original plan; amended days are counted apart, never mixed in. Pure.
*/

export interface Cell { n: number; avgR: number | null }
const cellOf = (rs: Array<number | null | undefined>): Cell => {
  const v = rs.filter((x): x is number => typeof x === 'number');
  return { n: v.length, avgR: v.length ? v.reduce((s, x) => s + x, 0) / v.length : null };
};

export interface ReplayStats {
  days: number;
  amended: number;
  /** How often each thing played out (closed days; amended days apart). */
  outcomes: Array<{ key: DayOutcome; label: string; n: number; amended: number }>;
  /** R per trade taken on backtests, by the scenario it was traded as. */
  byScenario: Array<{ key: 'A' | 'B' | 'none'; label: string; cell: Cell }>;
  /** A scenario played out — and was passed or missed. */
  notTaken: Array<{ key: 'A' | 'B'; played: number; taken: number; passed: number; missed: number }>;
  /** Trigger zones and kill switches in the plans of winning and losing days (net R of the day's trades). */
  zones: Array<{ label: string; win: number; loss: number }>;
  kills: Array<{ label: string; win: number; loss: number }>;
  winDays: number;
  lossDays: number;
}

export function replayStats(days: readonly ReplayDay[], trades: readonly Trade[]): ReplayStats {
  const closed = days.filter((d) => d.closed_at && d.outcome);
  const plain = closed.filter((d) => !d.amended_at);
  const outcomes = DAY_OUTCOMES.map((key) => ({
    key, label: DAY_OUTCOME_LABEL[key], n: plain.filter((d) => d.outcome === key).length, amended: closed.filter((d) => d.amended_at && d.outcome === key).length,
  }));

  const bt = trades.filter((t) => !t.deleted_at && isBacktest(t.account) && t.decision === 'take' && t.r_multiple != null);
  const byScenario = (['A', 'B', 'none'] as const).map((key) => ({
    key, label: key === 'none' ? 'Unplanned' : `Scenario ${key}`, cell: cellOf(bt.filter((t) => t.plan_scenario === key).map((t) => t.r_multiple)),
  }));

  const notTaken = (['A', 'B'] as const).map((key) => {
    const played = plain.filter((d) => playedOf(d.outcome).includes(key));
    const took = (d: ReplayDay) => (key === 'A' ? d.took_a : d.took_b);
    return { key, played: played.length, taken: played.filter((d) => took(d) === 'yes').length, passed: played.filter((d) => took(d) === 'passed').length, missed: played.filter((d) => took(d) === 'missed').length };
  });

  // A day's net R: its trades taken; no trades, no verdict.
  const netOf = new Map<string, number>();
  for (const t of bt) if (t.replay_day_id) netOf.set(t.replay_day_id, (netOf.get(t.replay_day_id) ?? 0) + (t.r_multiple as number));
  const win = plain.filter((d) => (netOf.get(d.id) ?? 0) > 0);
  const loss = plain.filter((d) => (netOf.get(d.id) ?? 0) < 0);
  const tally = (pickOf: (d: ReplayDay) => string[]) => {
    const labels = [...new Set([...win, ...loss].flatMap(pickOf))];
    return labels.map((label) => ({ label, win: win.filter((d) => pickOf(d).includes(label)).length, loss: loss.filter((d) => pickOf(d).includes(label)).length }))
      .sort((a, b) => b.win + b.loss - (a.win + a.loss));
  };
  return {
    days: closed.length, amended: closed.filter((d) => d.amended_at).length, outcomes, byScenario, notTaken,
    zones: tally((d) => [...d.scenarios.a.zones, ...d.scenarios.b.zones]),
    kills: tally((d) => [d.scenarios.a.kill, d.scenarios.b.kill].filter((k): k is NonNullable<typeof k> => !!k)),
    winDays: win.length, lossDays: loss.length,
  };
}
