/**
 * Rubric v2 (4 rows) — the New trade form as a timed decision, then an outcome.
 *
 * Why it exists: the old checklist did not filter. 43 of 51 backtests scored
 * exactly 92 (A), because Phase 1 was ticked by default, Phase 3 had already
 * happened by the time the chart was paused, and Phase 2 asked whether a thing
 * existed, not how good it was. Re-grades after the outcome followed the
 * result. So: four rows scored 0 / 1 / 2 on quality, a decision taken against
 * a clock at the candle close, and a grade that is locked with it.
 *
 * Stored as rubric_version 5 (1–3 are the old checklist, 4 its liquidity
 * trial); shown everywhere as "Rubric v2 (4 rows)". Pure: no React, no DB.
 */

export const RUBRIC_V2 = 5;
export const RUBRIC_V2_LABEL = 'Rubric v2 (4 rows)';
export const RUBRIC_V2_SHORT = 'v2';
export const isRubricV2 = (t: { rubric_version?: number | null }): boolean => t.rubric_version === RUBRIC_V2;

/* ───────────────────────── the four rows ───────────────────────── */

export type RowKey = 'row_sweep' | 'row_inversion' | 'row_path' | 'row_target';
export type RowScore = 0 | 1 | 2;
export const ROWS: ReadonlyArray<{ key: RowKey; label: string; defs: Record<RowScore, string> }> = [
  {
    key: 'row_sweep', label: 'Sweep',
    defs: {
      2: 'Named level taken: PDH/PDL, Asia/London high or low, data wick, EQH/EQL',
      1: 'Internal swing (ITH/ITL)',
      0: 'No sweep',
    },
  },
  {
    key: 'row_inversion', label: 'Inversion',
    defs: {
      2: 'Closes through within 3 candles, body larger than recent candles',
      1: 'Slow (4+ candles) or small body',
      0: 'Wick only / no close through',
    },
  },
  {
    key: 'row_path', label: 'Path',
    defs: {
      2: 'No opposing HTF gap and 0 opposing swings to target',
      1: 'Opposing 5m gap or 1 opposing swing',
      0: 'Opposing 15m+ gap in the path',
    },
  },
  {
    key: 'row_target', label: 'Target',
    defs: {
      2: 'Named liquidity at 2R+',
      1: 'ITH/ITL at 1.5–2R',
      0: 'Under 1.5R or no target',
    },
  },
];

/* ───────────────────────── the facts ───────────────────────── */

/** A (with the bias), B (against it), or Unplanned — stored in plan_scenario as 'A' | 'B' | 'none'. */
export type Scenario = 'A' | 'B' | 'none';
export const SCENARIO_LABEL: Record<Scenario, string> = { A: 'A · with the bias', B: 'B · against the bias', none: 'Unplanned' };
/** Measured on the leg that made the sweep — not the old swing range. */
export const LEG_LOCATIONS = ['Discount', 'EQ', 'Premium'] as const;
export type LegLocation = (typeof LEG_LOCATIONS)[number];
export const LEG_HELP = 'Measured on the leg that made the sweep — its low to its high — not the old swing range.';
/** Stored in target_type; the labels are the form's, the values the schema's. */
export const V2_TARGETS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'Data wick', label: 'Data wick' },
  { value: 'PDH/PDL', label: 'PDH/PDL' },
  { value: 'Session high/low', label: 'Session H/L (Asia, London, NY)' },
  { value: 'EQH/EQL', label: 'EQH/EQL' },
  { value: 'ITH/ITL', label: 'ITH/ITL' },
  { value: 'HTF FVG (1H/4H)', label: 'HTF FVG' },
  { value: 'Other', label: 'Other' },
];
/** Stored in entry_method (lib/anatomy ENTRY_METHODS). */
export const V2_ENTRIES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'On inversion close', label: 'On inversion close' },
  { value: 'Retrace into FVG', label: 'Retrace into FVG' },
  { value: 'CE of FVG', label: 'CE of FVG' },
  { value: 'Before close (anticipation)', label: 'Before close' },
];
/** Stored in planned_rr. */
export const V2_PLANNED_RS = ['1.5', '2', '2.5', '3', '4+'] as const;
export const plannedRNumber = (v: string | null | undefined): number | null =>
  v == null ? null : v === '4+' ? 4 : Number.isFinite(Number(v)) ? Number(v) : null;

/* ───────────────────────── the grade ───────────────────────── */

export type V2Letter = 'A+' | 'A' | 'B' | 'No trade';
/**
 * The singular-gap gate (047): ONE clean, unmistakable FVG, or more than one.
 * Pass/fail only — not part of the /8. More than one is No trade. Stored in
 * the checklist's own singular_gap column: true = one gap, false = more than one.
 */
export type SingularGap = 'one' | 'many';
export const SINGULAR_GAP_LABEL: Record<SingularGap, string> = { one: 'One gap', many: 'More than one' };
export const gapOf = (v: boolean | null | undefined): SingularGap | null => (v === true ? 'one' : v === false ? 'many' : null);
export const SINGULAR_GAP_QUESTION = 'Singular gap — ONE clean, unmistakable FVG';
/** Where the reaction started (047). A fact only: never graded. */
export const HTF_ORIGINS = ['None', '5m', '15m', '30m', '1H', '4H'] as const;
export type HtfOrigin = (typeof HTF_ORIGINS)[number];

export interface V2Input {
  row_sweep?: number | null; row_inversion?: number | null; row_path?: number | null; row_target?: number | null;
  /** true: one gap; false: more than one. */
  singular_gap?: boolean | null;
  /** Traded on a replay day whose plan had no bias (048): both scenarios are capped at B. */
  no_bias_day?: boolean | null;
  direction?: 'Long' | 'Short' | string | null;
  plan_scenario?: Scenario | string | null;
  leg_location?: LegLocation | string | null;
  planned_rr?: string | null;
}
export interface V2Cap { id: 'scenario-b' | 'unplanned' | 'leg' | 'no-bias'; message: string }
export interface V2Grade {
  /** Sum of the rows scored so far (out of 8). */
  total: number;
  /** Rows not yet scored. */
  missing: RowKey[];
  /** Every row scored, and the facts the caps and the R rule read are set. */
  complete: boolean;
  letter: V2Letter;
  /** A failed gate: more than one gap, or a row scored 0. */
  gate: { key: RowKey | 'singular_gap'; label: string } | null;
  caps: V2Cap[];
  /** Planned R under 1.5. */
  lowR: boolean;
  /** One line: why the letter is what it is. */
  reason: string;
}

const bandOf = (total: number): V2Letter => (total >= 8 ? 'A+' : total >= 6 ? 'A' : total === 5 ? 'B' : 'No trade');

/** The grade, live, from whatever has been answered. */
export function gradeV2(a: V2Input): V2Grade {
  const scores = ROWS.map((r) => a[r.key]);
  const missing = ROWS.filter((r, i) => scores[i] == null).map((r) => r.key);
  const total = scores.reduce<number>((s, v) => s + (v ?? 0), 0);
  const zero = ROWS.find((r) => a[r.key] === 0) ?? null;
  const manyGaps = a.singular_gap === false;
  const caps: V2Cap[] = [];
  if (a.plan_scenario === 'B') caps.push({ id: 'scenario-b', message: 'Scenario B (against the bias) — max B.' });
  if (a.plan_scenario === 'none') caps.push({ id: 'unplanned', message: 'Unplanned — max B.' });
  if (a.no_bias_day && a.plan_scenario === 'A') caps.push({ id: 'no-bias', message: 'No-bias replay day — max B.' });
  if ((a.direction === 'Long' && a.leg_location === 'Premium') || (a.direction === 'Short' && a.leg_location === 'Discount')) {
    caps.push({ id: 'leg', message: `${a.direction} in ${a.leg_location === 'Premium' ? 'premium' : 'discount'} of the leg — max B.` });
  }
  const r = plannedRNumber(a.planned_rr);
  const lowR = r != null && r < 1.5;
  const complete = missing.length === 0 && a.singular_gap != null && a.plan_scenario != null && a.direction != null && a.leg_location != null && a.planned_rr != null;

  let letter: V2Letter;
  let reason: string;
  if (manyGaps) { letter = 'No trade'; reason = 'Gate failed: more than one gap.'; }
  else if (zero) { letter = 'No trade'; reason = `Gate failed: ${zero.label} scored 0.`; }
  else if (lowR) { letter = 'No trade'; reason = 'Planned R under 1.5.'; }
  else {
    letter = bandOf(total);
    reason = letter === 'No trade' ? `${total}/8 — 4 or less is no trade.` : `${total}/8.`;
    if (caps.length && (letter === 'A+' || letter === 'A')) { letter = 'B'; reason = caps.map((c) => c.message).join(' '); }
    else if (caps.length) reason += ` ${caps.map((c) => c.message).join(' ')}`;
  }
  const gate = manyGaps ? { key: 'singular_gap' as const, label: 'Singular gap' } : zero ? { key: zero.key, label: zero.label } : null;
  return { total, missing, complete, letter, gate, caps, lowR, reason };
}

/** As stored: the letter column (No trade = F) and the score column (total / 8, as a percentage). */
export function storedGrade(g: V2Grade): { letter: 'A+' | 'A' | 'B' | 'F'; score: number } {
  return { letter: g.letter === 'No trade' ? 'F' : g.letter, score: Math.round((g.total / 8) * 100) };
}
export const V2_LETTER_OF = (stored: string | null | undefined): V2Letter | null =>
  stored == null ? null : stored === 'F' ? 'No trade' : (stored as V2Letter);

/* ───────────────────────── the decision ───────────────────────── */

export type Decision = 'take' | 'pass' | 'missed';
export const DECISION_LABEL: Record<Decision, string> = { take: 'Taken', pass: 'Passed', missed: 'Missed — too slow' };
export const DEFAULT_DECISION_SECONDS = 40;
export const OVERRIDE_PROMPT = 'Grade says no trade — take anyway?';

/** Seconds left, the colour band, whether the limit has passed, and by how much. */
export function clock(startedAt: number, now: number, limit: number) {
  const elapsed = Math.max(0, (now - startedAt) / 1000);
  const left = Math.max(0, limit - elapsed);
  return {
    elapsed, left,
    tone: left <= 5 ? 'red' as const : left <= 10 ? 'amber' as const : 'calm' as const,
    expired: elapsed >= limit,
    /** Seconds past the limit: the clock keeps counting after it chimes. */
    over: Math.max(0, elapsed - limit),
  };
}

/** Discard saves nothing, and is allowed only while no row has been scored. */
export const canDiscard = (a: V2Input): boolean => ROWS.every((r) => a[r.key] == null);

export interface DecisionRecord {
  decision: Decision;
  decided_at: string;
  decision_seconds: number;
  decision_limit: number | null;
  grade_override: boolean;
  late_rows: RowKey[] | null;
  /** When each row and the gate were last scored, in seconds since the form opened (048). */
  row_times: Partial<Record<TimedKey, number>> | null;
}
export type TimedKey = RowKey | 'singular_gap';

/**
 * The record Step 1 locks with. Running out of time does not decide for you:
 * the clock chimes and keeps counting, and Take, Pass or "Missed — too slow"
 * is still your call. Whatever you choose stores the real time it took, so a
 * decision past the limit shows as one; rows scored after it are marked late.
 */
export function lockDecision(o: {
  choice: Decision; startedAt: number; at: number; limit: number | null;
  grade: V2Grade; override?: boolean;
  /** When each row (and the gate) was scored (ms): which came after the limit, and the decision replay. */
  scoredAt?: Partial<Record<TimedKey, number>>;
}): DecisionRecord {
  const seconds = Math.round(((o.at - o.startedAt) / 1000) * 10) / 10;
  const decision: Decision = o.choice;
  const deadline = o.limit != null ? o.startedAt + o.limit * 1000 : null;
  const late = deadline == null ? [] : ROWS.map((r) => r.key).filter((k) => (o.scoredAt?.[k] ?? 0) > deadline);
  return {
    decision,
    decided_at: new Date(o.at).toISOString(),
    decision_seconds: seconds,
    decision_limit: o.limit,
    grade_override: decision === 'take' && o.grade.letter === 'No trade' && Boolean(o.override),
    late_rows: late.length ? late : null,
    row_times: (() => {
      const e = Object.entries(o.scoredAt ?? {}).filter(([, ms]) => typeof ms === 'number' && ms >= o.startedAt);
      return e.length ? Object.fromEntries(e.map(([k, ms]) => [k, Math.round(((ms as number) - o.startedAt) / 100) / 10])) : null;
    })(),
  };
}

/**
 * The decision replay (048): each timed answer in the order it was given,
 * how long it took after the one before, and the slowest. Null when the
 * trade has no timings (decided before 048).
 */
export function decisionReplay(t: { row_times?: Partial<Record<TimedKey, number>> | null; decision_seconds?: number | null }):
  { marks: Array<{ key: TimedKey; label: string; at: number; took: number }>; total: number; slowest: { label: string; took: number } | null } | null {
  if (!t.row_times || !Object.keys(t.row_times).length) return null;
  const label = (k: TimedKey) => (k === 'singular_gap' ? 'Gate' : ROWS.find((r) => r.key === k)?.label ?? k);
  const sorted = (Object.entries(t.row_times) as Array<[TimedKey, number]>).sort((a, b) => a[1] - b[1]);
  const marks = sorted.map(([key, at], i) => ({ key, label: label(key), at, took: Math.round((at - (i ? sorted[i - 1][1] : 0)) * 10) / 10 }));
  const total = t.decision_seconds ?? marks[marks.length - 1].at;
  const slowest = marks.reduce<(typeof marks)[number] | null>((m, x) => (!m || x.took > m.took ? x : m), null);
  return { marks, total, slowest: slowest ? { label: slowest.label, took: slowest.took } : null };
}

/** A decision made after the clock ran out (a miss is its own thing). */
export const overTime = (t: { decision?: string | null; decision_seconds?: number | null; decision_limit?: number | null }): boolean =>
  t.decision !== 'missed' && t.decision_limit != null && t.decision_seconds != null && t.decision_seconds > t.decision_limit;

/** Whether a Take needs the one-time question first. */
export const needsOverride = (g: V2Grade): boolean => g.letter === 'No trade';

/* ───────────────────────── the tags ───────────────────────── */

/** What went wrong, me: execution and management only — every one a rule broken. */
/*
  The Step 2 tag row (rubric v2, second version). ME and WORKED are mirror
  lists laid out on the same 3 × 4 grid: the tag at a position on one side is
  the other side's opposite at that position. "Entered on the trigger close"
  mirrors both entry mistakes (it sits beside "Entered late / chased"), and
  "Decided within time" mirrors the decision "Missed — too slow", not a tag.
*/
export const ME_TAGS = [
  'Moved stop before BE trigger', 'Missed a level in prep', 'Forced a reversal after a big move',
  'Same idea again after a loss', 'Stayed in after it stalled', 'Entered late / chased',
  'Entered early (before close or open)', 'Greed on target (moved it / refused partial)', 'Stop inside an HTF zone',
  "Traded against today's plan", 'No management plan before entry', 'Sized wrong',
] as const;
export const WORKED_TAGS_V2 = [
  'Stop untouched until BE trigger', 'Every level marked in prep', 'Waited for a structure shift before reversing',
  'After a loss, only a new setup', 'Exited when it stalled, per plan', 'Entered on the trigger close',
  'Decided within time', 'Took partials as planned', 'Stop where the idea fails, beyond the zone',
  "Followed today's plan", 'Management plan set before entry', 'Sized correctly',
] as const;
export type MeTag = (typeof ME_TAGS)[number];
export type WorkedTagV2 = (typeof WORKED_TAGS_V2)[number];
/** Each ME tag and the WORKED tag that is its opposite. */
export const MIRRORS: ReadonlyArray<readonly [MeTag, WorkedTagV2]> = [
  ['Moved stop before BE trigger', 'Stop untouched until BE trigger'],
  ['Missed a level in prep', 'Every level marked in prep'],
  ['Forced a reversal after a big move', 'Waited for a structure shift before reversing'],
  ['Same idea again after a loss', 'After a loss, only a new setup'],
  ['Stayed in after it stalled', 'Exited when it stalled, per plan'],
  ['Entered late / chased', 'Entered on the trigger close'],
  ['Entered early (before close or open)', 'Entered on the trigger close'],
  ['Greed on target (moved it / refused partial)', 'Took partials as planned'],
  ['Stop inside an HTF zone', 'Stop where the idea fails, beyond the zone'],
  ["Traded against today's plan", "Followed today's plan"],
  ['No management plan before entry', 'Management plan set before entry'],
  ['Sized wrong', 'Sized correctly'],
];
/** The opposite of a tag on the other side, if it has one. */
export function mirrorsOf(tag: string): string[] {
  return MIRRORS.flatMap(([me, worked]) => (me === tag ? [worked] : worked === tag ? [me] : []));
}
/**
 * Why a tag cannot be picked on this trade, or null. Its mirror already on
 * the trade blocks it; "Decided within time" is blocked by a decision made
 * past the clock or logged as missed.
 */
export function tagBlocked(tag: string, picked: { me: readonly string[]; worked: readonly string[] }, decision?: { decision?: string | null; overTime?: boolean }): string | null {
  const clash = mirrorsOf(tag).find((m) => picked.me.includes(m) || picked.worked.includes(m));
  if (clash) return `"${clash}" is on this trade — it is the opposite. Remove it first.`;
  if (tag === 'Decided within time' && (decision?.decision === 'missed' || decision?.overTime)) return 'The decision came after the clock.';
  return null;
}
/** ME tags of the first v2 list (046): retired, still a rule broken on the trades that carry them. */
export const RETIRED_ME_TAGS = [
  'Entered before the close', 'Moved target (greed)', 'Cut winner early', 'Ignored kill switch', 'Oversized',
  'Revenge / one more after a loss', 'Stop inside zone',
] as const;
export const RETIRED_WORKED_TAGS_V2 = [
  'Stop where the idea fails', 'Stop beyond the zone', 'Managed to plan', 'Let the runner run per plan',
  'Respected the kill switch', 'Stopped at the daily limit',
] as const;
/** Every "me" tag a v2 trade can carry — what rules-followed and the review count. */
export const ALL_ME_TAGS: readonly string[] = [...ME_TAGS, ...RETIRED_ME_TAGS];

/** What went wrong, market: outside my control, never a rule broken. Four are tapped; two are computed. */
export const MARKET_TAGS_V2 = ['Chop / no follow-through', 'One side in control all session', 'Opposing HTF gap formed after entry', 'News spike'] as const;
export const AUTO_MARKET_TAGS = ['Turned just short of target', 'Failed immediately'] as const;
/** The computed market tags: never tapped, written on save from Max R, the planned R and the exit. */
export function autoMarketTags(t: { mfe_r?: number | null; planned_rr?: string | null; exit_reason?: string | null }): string[] {
  const out: string[] = [];
  const planned = plannedRNumber(t.planned_rr);
  if (t.mfe_r != null && planned != null && t.mfe_r >= planned * 0.8 && t.exit_reason !== 'TP') out.push('Turned just short of target');
  if (t.mfe_r != null && t.mfe_r < 0.3) out.push('Failed immediately');
  return out;
}
/** On an older trade, these were execution and count as a rule broken in the weekly review. */
export const OLD_EXECUTION_TAGS = ['Moved stop', 'Cut winner early', 'Oversized', 'Revenge', 'Chased', 'Overtraded'] as const;

/* ───────────────────────── a pass or a miss: why ───────────────────────── */

/** Why I passed / why I missed (048). Several can apply; one is the main reason. */
export const PASS_REASONS = [
  'Rubric said no trade', 'Scenario B cap', 'Unclear target', "Couldn't read it in time",
  'Doubt or fear', 'Not in my plan', 'Waiting for a retest', 'Candle too big',
] as const;
export type PassReason = (typeof PASS_REASONS)[number];

/* ───────────────────────── rules followed ───────────────────────── */

export interface RulesVerdict { followed: boolean; reasons: string[] }

/**
 * Computed, never asked: Yes when the grade was not overridden and no "me"
 * tag is set, and the rules that apply hold — risk within the limit on every
 * account, the day rules on real accounts only (a backtest replays a week of
 * sessions in one sitting, so its days cannot be judged).
 */
export function rulesFollowedV2(t: {
  grade_override?: boolean | null; mistake_tags?: readonly string[] | null;
  risk_percent?: number | null;
}, o: { maxRiskPct: number; dayBreaks?: readonly string[]; backtest: boolean }): RulesVerdict {
  const reasons: string[] = [];
  if (t.grade_override) reasons.push('Took it although the grade said no trade');
  for (const tag of t.mistake_tags ?? []) if (ALL_ME_TAGS.includes(tag)) reasons.push(tag);
  if (t.risk_percent != null && t.risk_percent > o.maxRiskPct) reasons.push(`Risk over ${o.maxRiskPct}%`);
  if (!o.backtest) reasons.push(...(o.dayBreaks ?? []));
  return { followed: reasons.length === 0, reasons };
}

/* ───────────────────────── consistency ───────────────────────── */

/** Contradictions to flag on save; information, never a block. */
export function consistencyFlags(t: {
  mistake_tags?: readonly string[] | null; market_tags?: readonly string[] | null;
  reached_1r?: boolean | null; be_trigger?: string | null; management?: string | null;
  mfe_r?: number | null; planned_rr?: string | null;
}): string[] {
  const out: string[] = [];
  const beAt1R = t.be_trigger === '1R' || t.management === 'BE at 1R' || t.management === 'Partial at 1R, runner';
  if ((t.mistake_tags ?? []).includes('Moved stop before BE trigger') && t.reached_1r === true && beAt1R) {
    out.push('"Moved stop before BE trigger" — but the trade reached +1R, and the BE trigger was 1R.');
  }
  // "Turned just short of target" is computed now (autoMarketTags), so it cannot contradict Max R.
  return out;
}

/* ───────────────────────── facts, inferred ───────────────────────── */

/**
 * The session a clock time falls in, New York time: Asia 18:00–02:00, London
 * 02:00–08:30, NY AM 08:30–12:00, NY Lunch 12:00–13:30, NY PM 13:30–18:00.
 * For a trade logged as it happens; a backtest keeps its replay's session.
 */
export function sessionAtNy(minutes: number): 'Asia' | 'London' | 'NY AM' | 'NY Lunch' | 'NY PM' {
  if (minutes >= 18 * 60 || minutes < 2 * 60) return 'Asia';
  if (minutes < 8 * 60 + 30) return 'London';
  if (minutes < 12 * 60) return 'NY AM';
  if (minutes < 13 * 60 + 30) return 'NY Lunch';
  return 'NY PM';
}

/** The scenario the morning plan names for this direction, when exactly one of its plans goes that way. */
export function scenarioFromPlan(direction: string | null, plans: { aDir: string | null; bDir: string | null } | null): Scenario | null {
  if (!direction || !plans) return null;
  const a = plans.aDir === direction; const b = plans.bDir === direction;
  return a && !b ? 'A' : b && !a ? 'B' : null;
}

/** Rubric v2's sample on the Path: v2 trades locked at the decision, outcome written, never re-graded, Step 1 not edited after the outcome. */
export const V2_SAMPLE_TARGET = 50;
// A Step 1 edited after the outcome (049) is out: its grade was given knowing the result.
export function v2SampleCount(trades: ReadonlyArray<{ rubric_version?: number | null; decided_at?: string | null; outcome_at?: string | null; regrade?: string | null; deleted_at?: string | null; step1_edited_at?: string | null }>): number {
  return trades.filter((t) => t.rubric_version === RUBRIC_V2 && t.decided_at && t.outcome_at && !t.regrade && !t.deleted_at && !step1EditedAfterOutcome(t)).length;
}

/** The old checklist's scale: every grade not decided under Rubric v2. By-grade stats read only these, so the scales never mix. */
export const onOldScale = (t: { rubric_version?: number | null }): boolean => t.rubric_version !== RUBRIC_V2;

/* ───────────────────────── for the Markdown exports ───────────────────────── */

const sR = (v: number | null | undefined) => (v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}R`);

/** Which rubric graded the trade, as the exports name it. */
export const rubricName = (t: { rubric_version?: number | null }): string =>
  isRubricV2(t) ? RUBRIC_V2_LABEL : `checklist rubric ${t.rubric_version ?? 1}`;

/** One sentence for an export's "how to read" section. */
export const RUBRIC_V2_EXPLAINER = `**${RUBRIC_V2_LABEL}** trades (from November 2026) are graded differently: four rows scored 0/1/2 — sweep, inversion, path, target — out of 8 (8 = A+, 6–7 A, 5 B, 4 or less no trade; any row at 0 is no trade; scenario B, unplanned or the wrong side of the leg cap at B; planned R under 1.5 is no trade), decided against a clock before the outcome and locked. "No trade" is written F. Their grades are a different scale from the checklist's: never compare an old A with a v2 A.`;

/** The heading's result for a v2 record: the outcome, a pass or a miss at its hypothetical R, or still pending. */
export function v2Result(t: { decision?: string | null; outcome_at?: string | null; would_be_r?: number | null }): string | null {
  if (!t.decision) return null;
  if (!t.outcome_at) return 'outcome pending';
  if (t.decision === 'pass') return `Passed · would have ${sR(t.would_be_r)}`;
  if (t.decision === 'missed') return `Missed — too slow · would have ${sR(t.would_be_r)}`;
  return null;
}

/** The lines a v2 trade carries in an export, in place of the old checklist's. */
export function v2Lines(t: V2Input & {
  rubric_version?: number | null; grade_letter?: string | null; decision?: string | null; decision_seconds?: number | null; decision_limit?: number | null;
  grade_override?: boolean | null; late_rows?: readonly string[] | null; entry_method?: string | null; target_type?: string | null;
  confidence_at_entry?: number | null; would_be_mfe_r?: number | null; exit_reason?: string | null; regrade?: string | null;
  htf_origin?: string | null;
}): string[] {
  const g = gradeV2(t);
  const letter = V2_LETTER_OF(t.grade_letter) ?? (g.missing.length ? 'unfinished' : g.letter);
  const rows = ROWS.map((r) => `${r.label} ${t[r.key] ?? '—'}`).join(' · ');
  const late = t.late_rows?.length ? ` · ${t.late_rows.length} row${t.late_rows.length === 1 ? '' : 's'} scored after the clock` : '';
  return [
    `- **Rubric:** ${RUBRIC_V2_LABEL} · singular gap ${gapOf(t.singular_gap) ? SINGULAR_GAP_LABEL[gapOf(t.singular_gap)!].toLowerCase() : '—'} · ${rows} = ${g.total}/8 → **${letter}**${g.gate || g.caps.length || g.lowR ? ` (${g.reason})` : ''}${t.regrade ? ` · re-graded ${t.regrade} (never counted)` : ''}`,
    `- **Facts:** scenario ${t.plan_scenario ? SCENARIO_LABEL[t.plan_scenario as Scenario] : '—'} · leg ${t.leg_location ?? '—'} · target ${t.target_type ?? '—'} · entry ${t.entry_method ?? '—'} · planned ${t.planned_rr ? `${t.planned_rr}R` : '—'} · confidence ${t.confidence_at_entry ?? '—'}/5 · HTF origin ${t.htf_origin ?? '—'}`,
    `- **Decision:** ${t.decision ? DECISION_LABEL[t.decision as Decision] : '—'} in ${t.decision_seconds ?? '—'}s${t.decision_limit ? ` of ${t.decision_limit}s` : ' (untimed)'}${t.grade_override ? ' · **taken against a no-trade grade**' : ''}${late}${t.decision !== 'take' && t.would_be_mfe_r != null ? ` · would have reached ${sR(t.would_be_mfe_r)} at best` : ''}${t.exit_reason ? ` · exit ${t.exit_reason}` : ''}`,
  ];
}

/* ───────────────────────── Step 1, edited once (049) ───────────────────────── */

/**
 * What the one edit of Step 1 may change: the answers the grade is made of
 * and the facts beside them. Never the decision, its time or its clock.
 */
export const STEP1_EDITABLE = [
  'row_sweep', 'row_inversion', 'row_path', 'row_target', 'singular_gap', 'leg_location', 'htf_origin',
  'direction', 'plan_scenario', 'planned_rr', 'target_type', 'entry_method', 'confidence_at_entry',
] as const;
export type Step1Key = typeof STEP1_EDITABLE[number];
export type Step1Answers = Partial<Record<Step1Key, string | number | boolean | null>>;
/** What Step 1 said before its edit: the answers and the grade they made. */
export interface Step1Original { answers: Step1Answers; letter: string | null; score: number | null }

/** The answers as they stand on a trade, for the original kept beside an edit. */
export const step1Answers = (t: Record<string, unknown>): Step1Answers =>
  Object.fromEntries(STEP1_EDITABLE.map((k) => [k, (t[k] ?? null) as string | number | boolean | null]));

/**
 * The edit, checked: only Step 1's keys, each a value the form offers.
 * Returns the cleaned patch, or why not.
 */
export function cleanStep1Edit(raw: unknown): { ok: true; value: Step1Answers } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Nothing to edit.' };
  const r = raw as Record<string, unknown>;
  const out: Step1Answers = {};
  const among = (k: Step1Key, list: readonly unknown[], nullable = true) => {
    if (!(k in r)) return true;
    if (r[k] == null && nullable) { out[k] = null; return true; }
    if (!list.includes(r[k])) return false;
    out[k] = r[k] as string | number;
    return true;
  };
  const checks: Array<[Step1Key, boolean]> = [
    ...(['row_sweep', 'row_inversion', 'row_path', 'row_target'] as const).map((k) => [k, among(k, [0, 1, 2], false)] as [Step1Key, boolean]),
    ['singular_gap', among('singular_gap', [true, false], false)],
    ['leg_location', among('leg_location', LEG_LOCATIONS)],
    ['htf_origin', among('htf_origin', HTF_ORIGINS)],
    ['direction', among('direction', ['Long', 'Short'], false)],
    ['plan_scenario', among('plan_scenario', ['A', 'B', 'none'], false)],
    ['planned_rr', among('planned_rr', V2_PLANNED_RS, false)],
    ['target_type', among('target_type', V2_TARGETS.map((x) => x.value), false)],
    ['entry_method', among('entry_method', V2_ENTRIES.map((x) => x.value))],
    ['confidence_at_entry', among('confidence_at_entry', [1, 2, 3, 4, 5])],
  ];
  const bad = checks.find(([, ok]) => !ok);
  if (bad) return { ok: false, error: `Not an answer Step 1 offers: ${bad[0]}.` };
  const extra = Object.keys(r).filter((k) => !(STEP1_EDITABLE as readonly string[]).includes(k));
  if (extra.length) return { ok: false, error: `Only Step 1's answers can be edited, not ${extra.join(', ')}.` };
  return { ok: true, value: out };
}

/**
 * Edited after the outcome was written: the grade was set knowing the result,
 * so the trade leaves the "graded before the outcome" sample.
 */
export const step1EditedAfterOutcome = (t: { step1_edited_at?: string | null; outcome_at?: string | null }): boolean =>
  !!t.step1_edited_at && !!t.outcome_at && t.step1_edited_at > t.outcome_at;

/* ───────────────────────── the trade summary ───────────────────────── */

/** How Rubric v2 grades, in the words the summary shows under the rows. */
export const V2_MEASURE = {
  rows: 'Four rows, 0–2 each, out of 8: 8 is A+, 6–7 is A, 5 is B, 4 or less is no trade.',
  gates: 'No trade outright: more than one gap, any row at 0, or a planned R under 1.5.',
  caps: 'Capped at B: Scenario B, Unplanned, a no-bias replay day, or a long in the premium / a short in the discount of the leg.',
} as const;

/**
 * What a Rubric v2 trade still owes, as the form names it: `owed` blocks the
 * record from being complete; `optional` is only "not set".
 */
export function v2ToFill(t: {
  decision?: string | null; outcome_at?: string | null; r_multiple?: number | null; exit_reason?: string | null; mfe_r?: number | null;
  explanation?: string | null; lesson?: string | null; would_be_r?: number | null; pass_reasons?: readonly string[] | null;
  leg_location?: string | null; htf_origin?: string | null; entry_method?: string | null; confidence_at_entry?: number | null;
}, min: { explanation: number; lesson: number; pass: number }): { owed: string[]; optional: string[] } {
  const taken = (t.decision ?? 'take') === 'take';
  const len = (s: string | null | undefined) => (s ?? '').trim().length;
  const owed: string[] = [];
  if (!t.outcome_at) owed.push('Step 2 — the outcome');
  else if (taken) {
    if (t.r_multiple == null) owed.push('R');
    if (!t.exit_reason) owed.push('Exit');
    if (t.mfe_r == null) owed.push('Max R');
    if (len(t.explanation) < min.explanation) owed.push(`Explanation (${len(t.explanation)}/${min.explanation})`);
    if (len(t.lesson) < min.lesson) owed.push(`Lesson (${len(t.lesson)}/${min.lesson})`);
  } else {
    if (t.would_be_r == null) owed.push('R it would have made');
    if (!t.pass_reasons?.length) owed.push(t.decision === 'missed' ? 'Why I missed' : 'Why I passed');
    if (len(t.explanation) < min.pass) owed.push(`Explanation (${len(t.explanation)}/${min.pass})`);
  }
  const optional = [
    t.leg_location ? null : 'Leg location', t.htf_origin ? null : 'HTF origin',
    t.entry_method ? null : 'Entry type', t.confidence_at_entry ? null : 'Confidence',
  ].filter((x): x is string => x != null);
  return { owed, optional };
}
