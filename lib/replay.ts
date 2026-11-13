/*
  Replay plans (048): two plans per replay day, built from taps only, before
  replaying a session in FX Replay. The morning check-in does the same for
  Demo, Live, Eval and Funded; a replay day is its backtest twin. Pure — the
  storage is db/replay.ts.
*/

export const H4 = ['Bull', 'Bear', 'None'] as const;
export const OVERNIGHT = ['Highs run', 'Lows run', 'Both', 'Neither'] as const;
/** The levels a session can have run before the open: tapped once, they leave the zones and the targets. */
export const TAKEN_LEVELS = ['Asia high', 'Asia low', 'London high', 'London low', 'PDH', 'PDL', 'PWH', 'PWL'] as const;
export const NOTHING_TAKEN = 'Nothing taken';
const HIGH_LEVELS = new Set(['Asia high', 'London high', 'PDH', 'PWH']);
/** Overnight, derived from the taken levels (never tapped): which side was run. */
export function overnightOf(taken: readonly string[]): (typeof OVERNIGHT)[number] {
  const hi = taken.some((t) => HIGH_LEVELS.has(t)); const lo = taken.some((t) => !HIGH_LEVELS.has(t));
  return hi && lo ? 'Both' : hi ? 'Highs run' : lo ? 'Lows run' : 'Neither';
}
/** A 1H+ swing that started a displacement leg and is still untaken after several sessions. */
export const MAJOR_SWING_HELP = 'A 1H+ swing that started a displacement leg and is still untaken after several sessions.';
export const NEWS = ['None', 'Data at 8:30 ET', 'Data at 10:00 ET', 'Afternoon FOMC or speaker'] as const;
export const OPEN_LOCATIONS = ['Premium', 'EQ', 'Discount'] as const;
export const CONFIRMS = ['Sweep + iFVG close', 'HTF FVG delivery + iFVG close', 'SMT with ES', 'CISD'] as const;
export const RR_BANDS = ['<1.5', '1.5–2', '2+'] as const;
export const KILLS = [
  'Never reaches the zone', '5m closes through the zone', 'Opposing HTF gap forms', 'Not triggered by 10:30', "Takes the other side's liquidity first",
] as const;
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const;
export const DAY_OUTCOMES = ['A', 'B', 'C', 'unplanned', 'both'] as const;
export const DAY_OUTCOME_LABEL: Record<DayOutcome, string> = {
  A: 'A played', B: 'B played', C: 'Neither (C)', unplanned: 'Something unplanned happened', both: 'Both',
};
export const TOOK = ['yes', 'passed', 'missed'] as const;
export const TOOK_LABEL: Record<Took, string> = { yes: 'Yes', passed: 'Passed', missed: 'Missed' };
export const SCENARIO_C = 'Neither trigger zone reached by 10:30, or price chops through both: no trade.';
export const MAX_ZONES = 2;

export type Dir = 'Long' | 'Short';
export type DayOutcome = (typeof DAY_OUTCOMES)[number];
export type Took = (typeof TOOK)[number];

export interface ReplayContext {
  h4: (typeof H4)[number] | null;
  h1Agrees: boolean | null;
  overnight: (typeof OVERNIGHT)[number] | null;
  /** The levels run before the open; [] = nothing taken; null = not answered (a day planned before it was asked). */
  taken: string[] | null;
  news: (typeof NEWS)[number] | null;
  open: (typeof OPEN_LOCATIONS)[number] | null;
}
export interface ReplayScenario {
  dir: Dir | null;
  zones: string[];
  confirm: string[];
  target: string | null;
  rr: (typeof RR_BANDS)[number] | null;
  kill: (typeof KILLS)[number] | null;
}
export interface ReplayScenarios { a: ReplayScenario; b: ReplayScenario }

export interface ReplayDay {
  id: string; sitting_id: string; sequence: number; replay_date: string; weekday: string | null; instrument: string | null;
  context: ReplayContext; scenarios: ReplayScenarios;
  locked_at: string | null; amended_at: string | null; amended_context: ReplayContext | null; amended_scenarios: ReplayScenarios | null;
  outcome: DayOutcome | null; took_a: Took | null; took_b: Took | null; closed_at: string | null; ends_sitting: boolean; created_at: string;
}

export const emptyContext = (): ReplayContext => ({ h4: null, h1Agrees: null, overnight: null, taken: null, news: null, open: null });
export const emptyScenario = (): ReplayScenario => ({ dir: null, zones: [], confirm: [], target: null, rr: null, kill: null });
export const emptyScenarios = (): ReplayScenarios => ({ a: emptyScenario(), b: emptyScenario() });

/** The day bias, derived, never tapped: the 4H direction when the 1H agrees, otherwise no bias. */
export function dayBias(c: Pick<ReplayContext, 'h4' | 'h1Agrees'>): Dir | null {
  if (c.h1Agrees !== true) return null;
  return c.h4 === 'Bull' ? 'Long' : c.h4 === 'Bear' ? 'Short' : null;
}
const opposite = (d: Dir): Dir => (d === 'Long' ? 'Short' : 'Long');

/**
 * The scenarios' directions: A is with the bias (filled from it); with no
 * bias, A's is tapped. B is always the other way.
 */
export function withDirections(c: ReplayContext, s: ReplayScenarios): ReplayScenarios {
  const bias = dayBias(c);
  const aDir = bias ?? s.a.dir;
  return { a: { ...s.a, dir: aDir }, b: { ...s.b, dir: aDir ? opposite(aDir) : null } };
}

/** No bias: both scenarios are capped at B, as the grade caps an unplanned trade. */
export const noBiasCap = (c: Pick<ReplayContext, 'h4' | 'h1Agrees'>): boolean => dayBias(c) == null;

/** [either side, high (for a short), low (for a long)]. */
const SIDED: ReadonlyArray<readonly [string, string, string]> = [
  ['Asia H/L', 'Asia high', 'Asia low'], ['London H/L', 'London high', 'London low'], ['PDH/PDL', 'PDH', 'PDL'], ['PWH/PWL', 'PWH', 'PWL'],
  ['EQH/EQL', 'EQH', 'EQL'], ['ITH/ITL', 'ITH', 'ITL'], ['Major swing H/L', 'Major swing high', 'Major swing low'],
];
const HTF_FVGS = ['HTF FVG 5m', 'HTF FVG 15m', 'HTF FVG 1H', 'HTF FVG 4H'] as const;
/**
 * The trigger zones a scenario can use: the high side for a short, the low
 * side for a long (both while the direction is unknown); the data wick only
 * on a news day.
 */
export function zoneOptions(dir: Dir | null, news: ReplayContext['news'], taken: readonly string[] | null = null): string[] {
  const t = new Set(taken ?? []);
  const sided = SIDED.flatMap(([both, hi, lo]) => {
    if (dir === 'Short') return t.has(hi) ? [] : [hi];
    if (dir === 'Long') return t.has(lo) ? [] : [lo];
    return t.has(hi) && t.has(lo) ? [] : [both];
  });
  return [...sided, ...(hasNews(news) ? ['Data wick'] : []), ...HTF_FVGS];
}
export const hasNews = (news: ReplayContext['news']): boolean => news != null && news !== 'None';
/** The levels each pair target stands for, [high side, low side]: what "taken" can rule out. */
const TARGET_LEVELS: Record<string, [string[], string[]]> = {
  'PDH/PDL': [['PDH'], ['PDL']], 'PWH/PWL': [['PWH'], ['PWL']], 'Session H/L': [['Asia high', 'London high'], ['Asia low', 'London low']],
};
/**
 * First targets: the data wick only on a news day. A target already run
 * before the open is gone — a long aims above, a short below, so it is the
 * side the scenario aims at that has to be untaken (every level of it).
 */
export function targetOptions(news: ReplayContext['news'], dir: Dir | null = null, taken: readonly string[] | null = null): string[] {
  const t = new Set(taken ?? []);
  const gone = (o: string) => {
    const sides = TARGET_LEVELS[o];
    if (!sides) return false;
    const all = (xs: string[]) => xs.every((x) => t.has(x));
    return dir === 'Long' ? all(sides[0]) : dir === 'Short' ? all(sides[1]) : all(sides[0]) && all(sides[1]);
  };
  return [...(hasNews(news) ? ['Data wick'] : []), 'PDH/PDL', 'PWH/PWL', 'Session H/L', 'EQH/EQL', 'ITH/ITL', 'Major swing H/L', 'HTF FVG'].filter((o) => !gone(o));
}

/**
 * The plan kept in step with the context, as everything else is: a zone or a
 * target that is no longer offered (run before the open, the wrong side after
 * a change of direction, a data wick with no news) is let go.
 */
export function tidyScenarios(c: ReplayContext, s: ReplayScenarios): ReplayScenarios {
  const one = (sc: ReplayScenario): ReplayScenario => {
    const zones = zoneOptions(sc.dir, c.news, c.taken);
    const targets = targetOptions(c.news, sc.dir, c.taken);
    return { ...sc, zones: sc.zones.filter((z) => zones.includes(z)), target: sc.target && targets.includes(sc.target) ? sc.target : null };
  };
  return { a: one(s.a), b: one(s.b) };
}

/** A rough R under 1.5 cannot produce a trade (the grade says No trade under 1.5R). */
export const rrWarning = (rr: ReplayScenario['rr']): string | null => (rr === '<1.5' ? "This scenario can't produce a trade." : null);

/** What is still owed before "Lock & play". Confirmation is part of the plan; nothing is typed. */
export function lockMissing(c: ReplayContext, raw: ReplayScenarios): string[] {
  const s = tidyScenarios(c, withDirections(c, raw));
  const out: string[] = [];
  if (!c.h4) out.push('4H direction');
  if (c.h4 && c.h4 !== 'None' && c.h1Agrees == null) out.push('1H agrees');
  if (c.taken == null && !c.overnight) out.push('taken before the open');
  if (!c.news) out.push('news');
  if (!c.open) out.push('open location');
  for (const [k, sc] of [['A', s.a], ['B', s.b]] as const) {
    if (!sc.dir) out.push(`${k}: direction`);
    if (!sc.zones.length) out.push(`${k}: trigger zone`);
    if (!sc.confirm.length) out.push(`${k}: confirmation`);
    if (!sc.target) out.push(`${k}: first target`);
    if (!sc.rr) out.push(`${k}: rough R`);
    if (!sc.kill) out.push(`${k}: kill switch`);
  }
  return out;
}

/** One line per scenario, for the plan strip and the exports. */
export function scenarioLine(s: ReplayScenario): string {
  const route = `${s.zones.join(' + ') || 'no zone'}${s.target ? ` → ${s.target}` : ''}`;
  return [s.dir ?? '—', route, s.rr ? `${s.rr}R` : null, s.kill ? `kill: ${s.kill}` : null].filter(Boolean).join(' · ');
}

/** The plan a day is read by: always the locked original — an amendment is shown beside it, never instead. */
export const planOf = (d: Pick<ReplayDay, 'context' | 'scenarios'>) => ({ context: d.context, scenarios: d.scenarios });

/** "Copy last day": the plan without its date, lock, amendment, outcome or taken levels. */
export function copyPlan(d: Pick<ReplayDay, 'context' | 'scenarios'> | null): { context: ReplayContext; scenarios: ReplayScenarios } {
  if (!d) return { context: emptyContext(), scenarios: emptyScenarios() };
  // What was run before the open is the new day's own answer, never yesterday's.
  return { context: { ...emptyContext(), ...d.context, taken: null, overnight: null }, scenarios: { a: { ...d.scenarios.a, zones: [...d.scenarios.a.zones], confirm: [...d.scenarios.a.confirm] }, b: { ...d.scenarios.b, zones: [...d.scenarios.b.zones], confirm: [...d.scenarios.b.confirm] } } };
}

/** The weekday of a YYYY-MM-DD date, or null on a weekend. */
export function weekdayOf(date: string): (typeof WEEKDAYS)[number] | null {
  const d = new Date(`${date}T12:00:00Z`).getUTCDay();
  return d >= 1 && d <= 5 ? WEEKDAYS[d - 1] : null;
}
/** The next weekday after a date (Friday → Monday): the default for the next replay day. */
export function nextWeekday(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  do d.setUTCDate(d.getUTCDate() + 1); while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}
/** A backtest's date on its replay day: the replayed date, at the session's usual time (New York). */
export const SESSION_TIME: Record<string, string> = { Asia: '20:00', London: '03:00', 'NY AM': '09:45', 'NY Lunch': '12:00', 'NY PM': '13:30' };
export const replayTradeDate = (replayDate: string, session: string) => `${replayDate}T${SESSION_TIME[session] ?? '09:45'}`;

/** "Did I take it?", read off the trades that day linked to that scenario: a take wins over a pass, a pass over a miss. */
export function tookFromTrades(trades: ReadonlyArray<{ plan_scenario?: string | null; decision?: string | null }>, scenario: 'A' | 'B'): Took | null {
  const on = trades.filter((t) => t.plan_scenario === scenario);
  if (on.some((t) => t.decision === 'take')) return 'yes';
  if (on.some((t) => t.decision === 'pass')) return 'passed';
  if (on.some((t) => t.decision === 'missed')) return 'missed';
  return null;
}
/** Which scenarios a day's outcome says played. */
export const playedOf = (o: DayOutcome | null): Array<'A' | 'B'> => (o === 'A' ? ['A'] : o === 'B' ? ['B'] : o === 'both' ? ['A', 'B'] : []);

/* ───────────────────────── parsing (the API's input) ───────────────────────── */

const pick = <T extends string>(v: unknown, list: readonly T[]): T | null => (typeof v === 'string' && (list as readonly string[]).includes(v) ? v as T : null);
const ALL_ZONES = [...new Set([...zoneOptions(null, 'Data at 8:30 ET'), ...zoneOptions('Long', 'Data at 8:30 ET'), ...zoneOptions('Short', 'Data at 8:30 ET')])];
const ALL_TARGETS = targetOptions('Data at 8:30 ET', null, null);

export function parseContext(v: unknown): ReplayContext {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const taken = Array.isArray(o.taken) ? [...new Set(o.taken.filter((x): x is string => typeof x === 'string' && (TAKEN_LEVELS as readonly string[]).includes(x)))] : null;
  return {
    h4: pick(o.h4, H4), h1Agrees: typeof o.h1Agrees === 'boolean' ? o.h1Agrees : null,
    // Answered with the taken levels: overnight follows them. An older day keeps the overnight it was given.
    overnight: taken ? overnightOf(taken) : pick(o.overnight, OVERNIGHT), taken,
    news: pick(o.news, NEWS), open: pick(o.open, OPEN_LOCATIONS),
  };
}
function parseScenario(v: unknown): ReplayScenario {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const list = (x: unknown, allowed: readonly string[], max = 99) => (Array.isArray(x) ? [...new Set(x.filter((y): y is string => typeof y === 'string' && allowed.includes(y)))].slice(0, max) : []);
  return {
    dir: pick(o.dir, ['Long', 'Short'] as const), zones: list(o.zones, ALL_ZONES, MAX_ZONES), confirm: list(o.confirm, CONFIRMS),
    target: pick(o.target, ALL_TARGETS), rr: pick(o.rr, RR_BANDS), kill: pick(o.kill, KILLS),
  };
}
export function parseScenarios(v: unknown, context: ReplayContext): ReplayScenarios {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return tidyScenarios(context, withDirections(context, { a: parseScenario(o.a), b: parseScenario(o.b) }));
}

/** A replay day for the Markdown exports: its heading, then the locked plan (and the amendment, flagged). */
export function replayDayLines(d: ReplayDay): { heading: string; lines: string[] } {
  const bias = dayBias(d.context);
  const plan = (c: ReplayContext, s: ReplayScenarios) => [
    `- **Context:** 4H ${c.h4 ?? '—'}${c.h4 && c.h4 !== 'None' ? `, 1H ${c.h1Agrees ? 'agrees' : 'does not agree'}` : ''} → bias ${dayBias(c) ?? 'none (both scenarios max B)'} · overnight ${c.overnight ?? '—'}${c.taken ? ` (taken: ${c.taken.join(', ') || 'nothing'})` : ''} · news ${c.news ?? '—'} · open in ${c.open ?? '—'}`,
    `- **Scenario A:** ${scenarioLine(s.a)}${s.a.confirm.length ? ` · confirm: ${s.a.confirm.join(', ')}` : ''}`,
    `- **Scenario B:** ${scenarioLine(s.b)}${s.b.confirm.length ? ` · confirm: ${s.b.confirm.join(', ')}` : ''}`,
    `- **Scenario C:** ${SCENARIO_C}`,
  ];
  const took = [d.took_a && `A ${TOOK_LABEL[d.took_a].toLowerCase()}`, d.took_b && `B ${TOOK_LABEL[d.took_b].toLowerCase()}`].filter(Boolean).join(', ');
  return {
    heading: `Replay day ${d.sequence} · ${d.weekday ?? ''} ${d.replay_date}${d.amended_at ? ' · AMENDED' : ''}${bias ? ` · bias ${bias}` : ' · no bias'}`,
    lines: [
      ...plan(d.context, d.scenarios),
      ...(d.amended_at && d.amended_context && d.amended_scenarios ? ['- **Amended after locking** (the original above is what counts):', ...plan(d.amended_context, d.amended_scenarios).map((l) => `  ${l}`)] : []),
      `- **What played out:** ${d.outcome ? DAY_OUTCOME_LABEL[d.outcome] : 'not closed yet'}${took ? ` · ${took}` : ''}`,
    ],
  };
}
