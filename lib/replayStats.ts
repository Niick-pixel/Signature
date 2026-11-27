import { isBacktest } from './domain';
import { DAY_OUTCOMES, DAY_OUTCOME_LABEL, dayBias, overnightOf, playedOf, type DayOutcome, type ReplayDay } from './replay';
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
  /** Did your scenarios work? (big update, #5) — read from the same closed, unamended days. */
  plan: PlanAnalytics;
}

/** Trades taken on a group of days: how many, how many won, their R. */
export interface DayGroup { label: string; days: number; played: number; trades: number; wins: number; netR: number; avgR: number | null }
export interface PlanAnalytics {
  /** Days a plan played (A, B or both) against days it did not (C, or something unplanned): the trades taken on each. */
  matched: { played: DayGroup; notPlayed: DayGroup };
  /** Each kill switch: days its scenario did not play, how often you stayed out, and what trading it anyway made. */
  kills: Array<{ label: string; killed: number; stayedOut: number; tradedThrough: number; throughR: number | null }>;
  /** Each scenario's first target: trades taken on it when it played, and how many reached it. */
  targets: Array<{ label: string; trades: number; reached: number }>;
  /** By the day's bias (4H with the 1H agreeing, or none), and by what ran overnight. */
  byBias: DayGroup[];
  byOvernight: DayGroup[];
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
    kills: tally((d) => [...d.scenarios.a.kills, ...d.scenarios.b.kills]),
    winDays: win.length, lossDays: loss.length,
    plan: planAnalytics(plain, bt),
  };
}

/**
 * The plans read as evidence: which kinds of plan pay, never which trade to take. Only the locked
 * original plan of a closed day counts (amended days are left out, as everywhere here). A trade counts
 * on its replay day; "reached" is the target recorded as hit, or, when it was not recorded, a full win.
 */
export function planAnalytics(days: readonly ReplayDay[], trades: readonly Trade[]): PlanAnalytics {
  const onDay = new Map<string, Trade[]>();
  for (const t of trades) if (t.replay_day_id) onDay.set(t.replay_day_id, [...(onDay.get(t.replay_day_id) ?? []), t]);
  const group = (label: string, ds: readonly ReplayDay[]): DayGroup => {
    const ts = ds.flatMap((d) => onDay.get(d.id) ?? []);
    const netR = ts.reduce((s, t) => s + (t.r_multiple ?? 0), 0);
    return { label, days: ds.length, played: ds.filter((d) => playedOf(d.outcome).length > 0).length, trades: ts.length,
      wins: ts.filter((t) => t.outcome === 'Win').length, netR, avgR: ts.length ? netR / ts.length : null };
  };
  const isPlayed = (d: ReplayDay) => playedOf(d.outcome).length > 0;

  const kills = new Map<string, { killed: number; stayedOut: number; through: number[] }>();
  const targets = new Map<string, { trades: number; reached: number }>();
  for (const d of days) {
    const played = playedOf(d.outcome);
    for (const k of ['A', 'B'] as const) {
      const sc = d.scenarios[k === 'A' ? 'a' : 'b'];
      const onIt = (onDay.get(d.id) ?? []).filter((t) => t.plan_scenario === k);
      if (!played.includes(k)) {
        // Every kill switch the scenario named counts the day: which one fired is not recorded.
        for (const kill of sc.kills) {
          const row = kills.get(kill) ?? { killed: 0, stayedOut: 0, through: [] };
          row.killed += 1;
          if (onIt.length) row.through.push(...onIt.map((t) => t.r_multiple as number)); else row.stayedOut += 1;
          kills.set(kill, row);
        }
      } else if (sc.targets[0] && onIt.length) {
        const row = targets.get(sc.targets[0]) ?? { trades: 0, reached: 0 };
        row.trades += onIt.length;
        row.reached += onIt.filter((t) => t.target_hit ?? (t.outcome === 'Win' && t.partial_win !== true)).length;
        targets.set(sc.targets[0], row);
      }
    }
  }
  const biasOf = (d: ReplayDay) => { const b = d.context ? dayBias(d.context) : null; return b === 'Long' ? 'Bias long' : b === 'Short' ? 'Bias short' : 'No bias'; };
  const nightOf = (d: ReplayDay) => d.context?.overnight ?? (d.context?.taken ? overnightOf(d.context.taken) : null);
  const by = (labels: readonly string[], of: (d: ReplayDay) => string | null) =>
    labels.map((l) => group(l, days.filter((d) => of(d) === l))).filter((g) => g.days > 0);
  return {
    matched: { played: group('Plan played', days.filter(isPlayed)), notPlayed: group('Plan did not play', days.filter((d) => !isPlayed(d))) },
    kills: [...kills].map(([label, r]) => ({ label, killed: r.killed, stayedOut: r.stayedOut, tradedThrough: r.through.length,
      throughR: r.through.length ? r.through.reduce((a, b) => a + b, 0) / r.through.length : null })).sort((a, b) => b.killed - a.killed),
    targets: [...targets].map(([label, r]) => ({ label, ...r })).sort((a, b) => b.trades - a.trades),
    byBias: by(['Bias long', 'Bias short', 'No bias'], biasOf),
    byOvernight: by(['Highs run', 'Lows run', 'Both', 'Neither'], nightOf),
  };
}
