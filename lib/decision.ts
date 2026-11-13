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
export interface V2Input {
  row_sweep?: number | null; row_inversion?: number | null; row_path?: number | null; row_target?: number | null;
  direction?: 'Long' | 'Short' | string | null;
  plan_scenario?: Scenario | string | null;
  leg_location?: LegLocation | string | null;
  planned_rr?: string | null;
}
export interface V2Cap { id: 'scenario-b' | 'unplanned' | 'leg'; message: string }
export interface V2Grade {
  /** Sum of the rows scored so far (out of 8). */
  total: number;
  /** Rows not yet scored. */
  missing: RowKey[];
  /** Every row scored, and the facts the caps and the R rule read are set. */
  complete: boolean;
  letter: V2Letter;
  /** The row scored 0, when one is: a failed gate. */
  gate: { key: RowKey; label: string } | null;
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
  const caps: V2Cap[] = [];
  if (a.plan_scenario === 'B') caps.push({ id: 'scenario-b', message: 'Scenario B (against the bias) — max B.' });
  if (a.plan_scenario === 'none') caps.push({ id: 'unplanned', message: 'Unplanned — max B.' });
  if ((a.direction === 'Long' && a.leg_location === 'Premium') || (a.direction === 'Short' && a.leg_location === 'Discount')) {
    caps.push({ id: 'leg', message: `${a.direction} in ${a.leg_location === 'Premium' ? 'premium' : 'discount'} of the leg — max B.` });
  }
  const r = plannedRNumber(a.planned_rr);
  const lowR = r != null && r < 1.5;
  const complete = missing.length === 0 && a.plan_scenario != null && a.direction != null && a.leg_location != null && a.planned_rr != null;

  let letter: V2Letter;
  let reason: string;
  if (zero) { letter = 'No trade'; reason = `Gate failed: ${zero.label} scored 0.`; }
  else if (lowR) { letter = 'No trade'; reason = 'Planned R under 1.5.'; }
  else {
    letter = bandOf(total);
    reason = letter === 'No trade' ? `${total}/8 — 4 or less is no trade.` : `${total}/8.`;
    if (caps.length && (letter === 'A+' || letter === 'A')) { letter = 'B'; reason = caps.map((c) => c.message).join(' '); }
    else if (caps.length) reason += ` ${caps.map((c) => c.message).join(' ')}`;
  }
  return { total, missing, complete, letter, gate: zero ? { key: zero.key, label: zero.label } : null, caps, lowR, reason };
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
/** After the clock runs out, the rows can still be finished for this long. */
export const GRACE_SECONDS = 15;
export const OVERRIDE_PROMPT = 'Grade says no trade — take anyway?';

/** Seconds left, the colour band, and whether the grace has begun or ended. */
export function clock(startedAt: number, now: number, limit: number) {
  const elapsed = Math.max(0, (now - startedAt) / 1000);
  const left = Math.max(0, limit - elapsed);
  return {
    elapsed, left,
    tone: left <= 5 ? 'red' as const : left <= 10 ? 'amber' as const : 'calm' as const,
    expired: elapsed >= limit,
    graceLeft: Math.max(0, limit + GRACE_SECONDS - elapsed),
    graceOver: elapsed >= limit + GRACE_SECONDS,
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
}

/**
 * The record Step 1 locks with. A Take or a Pass before the limit stores the
 * time it took; the clock running out stores a miss at the full limit, with
 * any row scored after it marked late.
 */
export function lockDecision(o: {
  choice: Decision; startedAt: number; at: number; limit: number | null;
  grade: V2Grade; override?: boolean;
  /** When each row was scored (ms), to tell which came after the limit. */
  scoredAt?: Partial<Record<RowKey, number>>;
}): DecisionRecord {
  const seconds = Math.round(((o.at - o.startedAt) / 1000) * 10) / 10;
  const expired = o.limit != null && seconds >= o.limit;
  const decision: Decision = o.choice === 'missed' || expired ? 'missed' : o.choice;
  const deadline = o.limit != null ? o.startedAt + o.limit * 1000 : null;
  const late = deadline == null ? [] : ROWS.map((r) => r.key).filter((k) => (o.scoredAt?.[k] ?? 0) > deadline);
  return {
    decision,
    decided_at: new Date(o.at).toISOString(),
    decision_seconds: decision === 'missed' && o.limit != null ? o.limit : seconds,
    decision_limit: o.limit,
    grade_override: decision === 'take' && o.grade.letter === 'No trade' && Boolean(o.override),
    late_rows: late.length ? late : null,
  };
}

/** Whether a Take needs the one-time question first. */
export const needsOverride = (g: V2Grade): boolean => g.letter === 'No trade';

/* ───────────────────────── the tags ───────────────────────── */

/** What went wrong, me: execution and management only — every one a rule broken. */
export const ME_TAGS = [
  'Entered late / chased', 'Entered before the close', 'Moved stop before BE trigger', 'Moved target (greed)',
  'Cut winner early', 'Ignored kill switch', "Traded against today's plan", 'Oversized',
  'Revenge / one more after a loss', 'Stop inside zone',
] as const;
/** What went wrong, market: outside my control, never a rule broken. */
export const MARKET_TAGS_V2 = ['Chop / no follow-through', 'News spike', 'Turned just short of target', 'Opposing HTF gap formed after entry'] as const;
export const WORKED_TAGS_V2 = [
  'Decided within time', 'Stop where the idea fails', 'Stop beyond the zone', 'Managed to plan',
  'Took partials as planned', 'Let the runner run per plan', 'Respected the kill switch',
  'Stopped at the daily limit', 'Sized correctly',
] as const;
/** On an older trade, these were execution and count as a rule broken in the weekly review. */
export const OLD_EXECUTION_TAGS = ['Moved stop', 'Cut winner early', 'Oversized', 'Revenge', 'Chased', 'Overtraded'] as const;

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
  for (const tag of t.mistake_tags ?? []) if ((ME_TAGS as readonly string[]).includes(tag)) reasons.push(tag);
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
  const planned = plannedRNumber(t.planned_rr);
  if ((t.market_tags ?? []).includes('Turned just short of target')) {
    if (planned == null || t.mfe_r == null) out.push('"Turned just short of target" needs Max R and a planned R to check against.');
    else if (t.mfe_r < planned * 0.8) out.push(`"Turned just short of target" — Max R ${t.mfe_r}R is under 80% of the planned ${planned}R.`);
  }
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

/** Rubric v2's sample on the Path: v2 trades locked at the decision, outcome written, never re-graded. */
export const V2_SAMPLE_TARGET = 50;
export function v2SampleCount(trades: ReadonlyArray<{ rubric_version?: number | null; decided_at?: string | null; outcome_at?: string | null; regrade?: string | null; deleted_at?: string | null }>): number {
  return trades.filter((t) => t.rubric_version === RUBRIC_V2 && t.decided_at && t.outcome_at && !t.regrade && !t.deleted_at).length;
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
}): string[] {
  const g = gradeV2(t);
  const letter = V2_LETTER_OF(t.grade_letter) ?? (g.missing.length ? 'unfinished' : g.letter);
  const rows = ROWS.map((r) => `${r.label} ${t[r.key] ?? '—'}`).join(' · ');
  const late = t.late_rows?.length ? ` · ${t.late_rows.length} row${t.late_rows.length === 1 ? '' : 's'} scored after the clock` : '';
  return [
    `- **Rubric:** ${RUBRIC_V2_LABEL} · ${rows} = ${g.total}/8 → **${letter}**${g.gate || g.caps.length || g.lowR ? ` (${g.reason})` : ''}${t.regrade ? ` · re-graded ${t.regrade} (never counted)` : ''}`,
    `- **Facts:** scenario ${t.plan_scenario ? SCENARIO_LABEL[t.plan_scenario as Scenario] : '—'} · leg ${t.leg_location ?? '—'} · target ${t.target_type ?? '—'} · entry ${t.entry_method ?? '—'} · planned ${t.planned_rr ? `${t.planned_rr}R` : '—'} · confidence ${t.confidence_at_entry ?? '—'}/5`,
    `- **Decision:** ${t.decision ? DECISION_LABEL[t.decision as Decision] : '—'} in ${t.decision_seconds ?? '—'}s${t.decision_limit ? ` of ${t.decision_limit}s` : ' (untimed)'}${t.grade_override ? ' · **taken against a no-trade grade**' : ''}${late}${t.decision !== 'take' && t.would_be_mfe_r != null ? ` · would have reached ${sR(t.would_be_mfe_r)} at best` : ''}${t.exit_reason ? ` · exit ${t.exit_reason}` : ''}`,
  ];
}
