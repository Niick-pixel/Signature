/**
 * The field registry: every trade field the Edge Engine can read, with when
 * it was knowable and whether it is a fact or a judgement. The engine
 * iterates this list — adding a field here makes it analyzable everywhere.
 *
 * timing
 *  - pre      known before the entry (the setup). The only fields a
 *             predictive module may read (the leakage firewall).
 *  - in       during the trade (times, size).
 *  - outcome  how it ended (R, exit, excursion).
 *  - post     reflection written afterwards (tags, lesson, regrade).
 *  - meta     who and where (source, account, rubric, session) — for
 *             stratifying and filtering, never a predictor.
 * objective   a fact read off the chart, rather than a judgement that
 *             hindsight can colour (grade, confidence, calm).
 */
import { CHECKLIST_PHASES, HTF_BIASES, PREMIUM_DISCOUNTS, SESSIONS, SETUP_TYPES, TARGET_TYPES, isBacktest, isHypothetical } from '../domain';
import {
  BIAS_TIMEFRAMES, EMOTIONS_AFTER, ENTRY_METHODS, EXIT_REASONS, FVG_QUALITIES, LIQUIDITY_EVENTS, MAE_BUCKETS, MFE_BUCKETS,
  MOVED_TO_BE, PLANNED_RRS, SMT_STATES, STOP_METHODS, TIMEFRAMES, TRI_ANSWERS, closureLetter, closureScore,
} from '../anatomy';
import type { Trade } from '../types';

export type Timing = 'pre' | 'in' | 'outcome' | 'post' | 'meta';
export type FieldValue = string | number | boolean | null;

export interface FieldDef {
  key: string;
  label: string;
  kind: 'cat' | 'num' | 'bool';
  options?: readonly string[];
  /** Numeric fields: the scale, for distances. */
  range?: readonly [number, number];
  timing: Timing;
  objective: boolean;
  source: 'trade' | 'derived';
  /** A pre field the predictive modules use. Off for pre fields that only restate another (the checklist score). */
  predictor: boolean;
  /** Checklist items: the rubric's points, the prior for the learned setup score. */
  points?: number;
  get: (t: Trade) => FieldValue;
}

const col = (key: keyof Trade) => (t: Trade) => (t[key] ?? null) as FieldValue;
const tri = (key: keyof Trade) => (t: Trade) => (t[key] == null ? null : Boolean(t[key]));

/** Where the trade came from: live, demo, eval (Eval and Funded), backtest, missed. */
export function sourceOf(account: string): 'live' | 'demo' | 'eval' | 'backtest' | 'missed' {
  if (isBacktest(account)) return 'backtest';
  if (isHypothetical(account)) return 'missed';
  return account === 'Live' ? 'live' : account === 'Demo' ? 'demo' : 'eval';
}

/** The session, as a killzone: outside when the checklist says the entry was outside one. */
function killzone(t: Trade): FieldValue {
  if (t.chk_killzone === false) return 'Outside';
  return t.session === 'NY Lunch' ? 'Outside' : t.session ?? null;
}

type Item = { kind: string; key: string; points: number; label: string };
const CHECK_ITEMS = (CHECKLIST_PHASES as readonly { items: readonly Item[] }[]).flatMap((p) => [...p.items]).filter((i) => i.kind === 'box' && i.key.startsWith('chk_'));

export const FIELDS: FieldDef[] = [
  // ── meta: stratify, never predict
  { key: 'source', label: 'Source', kind: 'cat', options: ['live', 'demo', 'eval', 'backtest', 'missed'], timing: 'meta', objective: true, source: 'derived', predictor: false, get: (t) => sourceOf(t.account) },
  { key: 'account', label: 'Account', kind: 'cat', timing: 'meta', objective: true, source: 'trade', predictor: false, get: col('account') },
  { key: 'rubric_version', label: 'Rubric', kind: 'num', timing: 'meta', objective: true, source: 'trade', predictor: false, get: col('rubric_version') },
  { key: 'session_index', label: 'Replay session', kind: 'num', timing: 'meta', objective: true, source: 'trade', predictor: false, get: col('session_index') },

  // ── pre: the setup
  { key: 'direction', label: 'Direction', kind: 'cat', options: ['Long', 'Short'], timing: 'pre', objective: true, source: 'trade', predictor: true, get: col('direction') },
  { key: 'setup_type', label: 'Setup', kind: 'cat', options: SETUP_TYPES, timing: 'pre', objective: true, source: 'trade', predictor: true, get: col('setup_type') },
  { key: 'killzone', label: 'Killzone', kind: 'cat', options: [...SESSIONS.filter((s) => s !== 'NY Lunch'), 'Outside'], timing: 'pre', objective: true, source: 'derived', predictor: true, get: killzone },
  { key: 'htf_bias', label: 'HTF bias', kind: 'cat', options: HTF_BIASES, timing: 'pre', objective: false, source: 'trade', predictor: false, get: col('htf_bias') },
  { key: 'with_bias', label: 'With the HTF bias', kind: 'bool', timing: 'pre', objective: false, source: 'derived', predictor: true,
    get: (t) => (t.htf_bias === 'With bias' ? true : t.htf_bias === 'Against bias' ? false : null) },
  { key: 'htf_bias_tf', label: 'Bias timeframe', kind: 'cat', options: BIAS_TIMEFRAMES, timing: 'pre', objective: true, source: 'trade', predictor: true, get: col('htf_bias_tf') },
  { key: 'range_location', label: 'Range location', kind: 'cat', options: PREMIUM_DISCOUNTS, timing: 'pre', objective: true, source: 'trade', predictor: false, get: col('premium_discount') },
  { key: 'location_aligned', label: 'Right side of the range', kind: 'bool', timing: 'pre', objective: true, source: 'derived', predictor: true,
    get: (t) => (!t.premium_discount ? null : t.premium_discount === 'Equilibrium' ? null
      : t.direction === 'Long' ? t.premium_discount === 'Discount' : t.premium_discount === 'Premium') },
  { key: 'liquidity_event', label: 'Liquidity event', kind: 'cat', options: LIQUIDITY_EVENTS, timing: 'pre', objective: true, source: 'trade', predictor: true, get: col('liquidity_event') },
  { key: 'sweep_tier', label: 'Sweep', kind: 'cat', options: ['major', 'minor', 'none'], timing: 'pre', objective: false, source: 'trade', predictor: true, get: col('sweep_tier') },
  { key: 'sweep_tf', label: 'Sweep timeframe', kind: 'cat', options: TIMEFRAMES, timing: 'pre', objective: true, source: 'trade', predictor: true, get: col('sweep_tf') },
  { key: 'fvg_tf', label: 'FVG timeframe', kind: 'cat', options: TIMEFRAMES, timing: 'pre', objective: true, source: 'trade', predictor: true, get: col('fvg_tf') },
  { key: 'entry_tf', label: 'Entry timeframe', kind: 'cat', options: TIMEFRAMES, timing: 'pre', objective: true, source: 'trade', predictor: true, get: col('entry_tf') },
  { key: 'fvg_quality', label: 'FVG quality', kind: 'cat', options: FVG_QUALITIES, timing: 'pre', objective: false, source: 'trade', predictor: true, get: col('fvg_quality') },
  { key: 'fvg_overlap', label: 'FVG', kind: 'cat', options: ['Clean', 'Overlapping gaps'], timing: 'pre', objective: true, source: 'derived', predictor: true,
    get: (t) => (t.singular_gap == null ? null : t.singular_gap ? 'Clean' : 'Overlapping gaps') },
  { key: 'candle_strength', label: 'Candle strength', kind: 'num', range: [0, 4], timing: 'pre', objective: false, source: 'trade', predictor: false, get: col('candle_strength') },
  { key: 'inversion_speed', label: 'Inversion speed', kind: 'num', range: [0, 3], timing: 'pre', objective: false, source: 'trade', predictor: false, get: col('inversion_speed') },
  { key: 'rr_score', label: 'R:R score', kind: 'num', range: [0, 3], timing: 'pre', objective: false, source: 'trade', predictor: false, get: col('rr_score') },
  { key: 'closure_score', label: 'Closure score', kind: 'num', range: [0, 10], timing: 'pre', objective: false, source: 'derived', predictor: true, get: (t) => closureScore(t) },
  { key: 'closure_letter', label: 'Closure grade', kind: 'cat', options: ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C', 'F'], timing: 'pre', objective: false, source: 'derived', predictor: false, get: (t) => closureLetter(closureScore(t)) },
  { key: 'cisd', label: 'CISD', kind: 'bool', timing: 'pre', objective: true, source: 'trade', predictor: true, get: tri('cisd') },
  { key: 'smt_state', label: 'SMT (NQ vs ES)', kind: 'cat', options: SMT_STATES, timing: 'pre', objective: true, source: 'trade', predictor: true, get: col('smt_state') },
  { key: 'target_type', label: 'Target', kind: 'cat', options: TARGET_TYPES, timing: 'pre', objective: true, source: 'trade', predictor: true, get: col('target_type') },
  { key: 'into_eq_pool', label: 'Into an EQ pool', kind: 'bool', timing: 'pre', objective: true, source: 'trade', predictor: true, get: tri('into_eq_pool') },
  { key: 'planned_rr', label: 'Planned R:R', kind: 'cat', options: PLANNED_RRS, timing: 'pre', objective: true, source: 'trade', predictor: true, get: col('planned_rr') },
  { key: 'entry_method', label: 'Entry', kind: 'cat', options: ENTRY_METHODS, timing: 'pre', objective: true, source: 'trade', predictor: true, get: col('entry_method') },
  { key: 'stop_method', label: 'Stop', kind: 'cat', options: STOP_METHODS, timing: 'pre', objective: true, source: 'trade', predictor: true, get: col('stop_method') },
  ...CHECK_ITEMS.map((i): FieldDef => ({
    key: i.key, label: i.label, kind: 'bool', timing: 'pre', objective: i.key !== 'chk_htf_bias' && i.key !== 'chk_displacement_fvg',
    source: 'trade', predictor: true, points: i.points, get: tri(i.key as keyof Trade),
  })),
  { key: 'checklist_score', label: 'Checklist score', kind: 'num', range: [0, 100], timing: 'pre', objective: false, source: 'trade', predictor: false, get: col('checklist_score') },
  { key: 'grade', label: 'Grade', kind: 'cat', options: ['A+', 'A', 'B', 'C', 'D', 'F'], timing: 'pre', objective: false, source: 'trade', predictor: false, get: col('grade_letter') },
  { key: 'pre_state', label: 'Calm before entry', kind: 'num', range: [1, 5], timing: 'pre', objective: false, source: 'trade', predictor: true, get: col('pre_state') },
  { key: 'confidence_at_entry', label: 'Confidence', kind: 'num', range: [1, 5], timing: 'pre', objective: false, source: 'trade', predictor: false, get: col('confidence_at_entry') },
  { key: 'graded_first', label: 'Graded before the outcome', kind: 'bool', timing: 'meta', objective: true, source: 'derived', predictor: false, get: (t) => !t.graded_post_hoc },

  // ── in: during the trade
  { key: 'entry_time', label: 'Entry time', kind: 'cat', timing: 'in', objective: true, source: 'trade', predictor: false, get: col('entry_time') },
  { key: 'contracts', label: 'Contracts', kind: 'num', timing: 'in', objective: true, source: 'trade', predictor: false, get: col('contracts') },

  // ── outcome
  { key: 'r_multiple', label: 'R', kind: 'num', timing: 'outcome', objective: true, source: 'trade', predictor: false, get: col('r_multiple') },
  { key: 'outcome', label: 'Outcome', kind: 'cat', timing: 'outcome', objective: true, source: 'trade', predictor: false, get: col('outcome') },
  { key: 'exit_reason', label: 'Exit', kind: 'cat', options: EXIT_REASONS, timing: 'outcome', objective: true, source: 'trade', predictor: false, get: col('exit_reason') },
  { key: 'mfe_bucket', label: 'Max in favour', kind: 'cat', options: MFE_BUCKETS, timing: 'outcome', objective: true, source: 'trade', predictor: false, get: col('mfe_bucket') },
  { key: 'mae_bucket', label: 'Max heat', kind: 'cat', options: MAE_BUCKETS, timing: 'outcome', objective: true, source: 'trade', predictor: false, get: col('mae_bucket') },
  { key: 'target_hit_later', label: 'Target hit later', kind: 'cat', options: TRI_ANSWERS, timing: 'outcome', objective: true, source: 'trade', predictor: false, get: col('target_hit_later') },
  { key: 'moved_to_be', label: 'Moved to BE', kind: 'cat', options: MOVED_TO_BE, timing: 'outcome', objective: true, source: 'trade', predictor: false, get: col('moved_to_be') },
  { key: 'mfe_r', label: 'Max R reached', kind: 'num', timing: 'outcome', objective: true, source: 'trade', predictor: false, get: col('mfe_r') },
  { key: 'pnl_dollars', label: 'P&L', kind: 'num', timing: 'outcome', objective: true, source: 'trade', predictor: false, get: col('pnl_dollars') },

  // ── post: reflection
  { key: 'mistake_tags', label: 'Mistake tags', kind: 'cat', timing: 'post', objective: false, source: 'trade', predictor: false, get: (t) => (t.mistake_tags ?? []).join('|') || null },
  { key: 'rule_breaks_manual', label: 'Rules you broke', kind: 'cat', timing: 'post', objective: false, source: 'trade', predictor: false, get: (t) => (t.rule_breaks_manual ?? []).join('|') || null },
  { key: 'regrade', label: 'Honest re-grade', kind: 'cat', timing: 'post', objective: false, source: 'trade', predictor: false, get: col('regrade') },
  { key: 'blind_grade', label: 'Blind grade', kind: 'cat', timing: 'post', objective: false, source: 'trade', predictor: false, get: col('blind_grade') },
  { key: 'emotion_after', label: 'Emotion after', kind: 'cat', options: EMOTIONS_AFTER, timing: 'post', objective: false, source: 'trade', predictor: false, get: col('emotion_after') },
  { key: 'lesson', label: 'Lesson', kind: 'cat', timing: 'post', objective: false, source: 'trade', predictor: false, get: col('lesson') },
  { key: 'explanation', label: 'Explanation', kind: 'cat', timing: 'post', objective: false, source: 'trade', predictor: false, get: col('explanation') },
];

/** The leakage firewall: the only fields a predictive module may read. */
export const PREDICTORS: readonly FieldDef[] = FIELDS.filter((f) => f.timing === 'pre' && f.predictor);

export function field(key: string): FieldDef | undefined {
  return FIELDS.find((f) => f.key === key);
}

/** Share of trades with each field recorded — the engine reports it, and works with what is there. */
export function completeness(trades: readonly Trade[], fields: readonly FieldDef[] = FIELDS): Array<{ key: string; label: string; timing: Timing; filled: number; n: number }> {
  return fields.map((f) => ({ key: f.key, label: f.label, timing: f.timing, filled: trades.filter((t) => f.get(t) != null).length, n: trades.length }));
}
