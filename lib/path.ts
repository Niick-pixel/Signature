/**
 * The Path: ordered steps toward a funded account.
 *
 * Pure: everything here takes trades and stored steps and works out where I
 * stand. The database (db/path.ts) only stores the steps, what I confirmed by
 * hand, and what happened — never a status, so "only one step is active" and
 * "a step unlocks only when the one before it is done" cannot drift out of
 * true. A step is done when completed_at is set; the first step that is not
 * done is active; everything after it is locked.
 */
import { CURRENT_RUBRIC } from './rubric';
import { derivedAdherence } from './adherence';
import { isTaken } from './domain';
import type { Trade } from './types';

export type Metric = 'count' | 'expectancy' | 'pct_pre_graded';
export type Op = '>=' | '>';

export interface CriterionFilter {
  /** Stored account values. Empty or absent means every account. */
  accounts?: string[];
  /** 'current' follows the rubric in force; a number pins one version. */
  rubric?: 'current' | number;
  /** Only trades graded before the outcome was known. */
  preGraded?: boolean;
  /** Only trades the checklist says followed the rules (lib/adherence). */
  followed?: boolean;
  /** Effective grade (the honest re-grade, when there is one). */
  grades?: string[];
  /** 'step_start' counts only trades logged since the step became active. */
  since?: 'step_start';
}

export interface Criterion {
  id: string;
  kind: 'auto' | 'manual';
  label: string;
  /** A few words for the banner: "14 / 50 graded before outcome". */
  short?: string;
  metric?: Metric;
  op?: Op;
  target?: number;
  filter?: CriterionFilter;
  /** What a manual criterion needs before it can be ticked. */
  proof?: 'note' | 'screenshot_or_note';
}

export interface ManualState {
  done: boolean;
  note: string | null;
  proof_path: string | null;
  at: string;
}

export interface CommitmentGuard {
  /** Choosing one of these accounts on a trade breaks the promise. */
  accounts?: string[];
  /** Logging any eval purchase breaks it. */
  evalPurchase?: boolean;
  /** Logging a purchase past this step's budget breaks it. */
  overBudget?: boolean;
}

export interface Commitment {
  id: string;
  /** "No paid eval until the demo evaluation is passed." */
  text: string;
  guard: CommitmentGuard;
}

export interface Budget { max_evals: number; max_dollars: number }

export interface PathStep {
  id: string;
  position: number;
  title: string;
  why: string;
  next_action: string | null;
  criteria: Criterion[];
  manual_state: Record<string, ManualState>;
  /** Held while THIS step is not done. */
  commitments: Commitment[];
  budget: Budget | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface EvalPurchase {
  id: string;
  date: string;
  provider: string;
  size: string;
  cost: number;
  note: string | null;
  created_at: string;
}

export interface PathEvent {
  id: string;
  at: string;
  kind: 'commitment_break' | 'daily_limit' | 'step_done';
  step_id: string | null;
  step_title: string | null;
  commitment_id: string | null;
  commitment_text: string | null;
  reason: string | null;
  trade_id: string | null;
  eval_purchase_id: string | null;
}

export type StepStatus = 'locked' | 'active' | 'done';

export interface CriterionProgress {
  criterion: Criterion;
  /** Count, R or percent; null when there is nothing to measure yet. */
  value: number | null;
  /** How many trades the value was measured over. */
  n: number;
  met: boolean;
  /** "14 / 50", "+0.42R over 12", "Not yet" */
  display: string;
}

export interface StepView extends PathStep {
  status: StepStatus;
  progress: CriterionProgress[];
  /** Every criterion met (or ticked). */
  complete: boolean;
  /** What to do next, in one line. */
  nextAction: string;
  /** "14 / 50 graded before outcome" — the banner's last part. */
  headline: string;
}

const signedR = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}R`;

/** The grade a trade is held to: the honest re-grade wins when there is one (it can only be harsher). */
export const effectiveGrade = (t: Pick<Trade, 'grade_letter' | 'regrade'>): string => t.regrade ?? t.grade_letter;

/** The trades a criterion is measured over. Taken trades only: a pass is graded, but never priced. */
export function criterionTrades(c: Criterion, trades: readonly Trade[], step: Pick<PathStep, 'started_at'>): Trade[] {
  const f = c.filter ?? {};
  const rubric = f.rubric === 'current' ? CURRENT_RUBRIC : f.rubric;
  return trades.filter((t) => {
    if (t.deleted_at) return false;
    if (!isTaken(t.outcome)) return false;
    if (f.accounts?.length && !f.accounts.includes(t.account)) return false;
    if (rubric != null && t.rubric_version !== rubric) return false;
    if (f.preGraded && t.graded_post_hoc) return false;
    if (f.followed && !derivedAdherence(t)) return false;
    if (f.grades?.length && !f.grades.includes(effectiveGrade(t))) return false;
    if (f.since === 'step_start' && (!step.started_at || t.created_at < step.started_at)) return false;
    return true;
  });
}

function compare(value: number, op: Op = '>=', target = 0): boolean {
  return op === '>' ? value > target : value >= target;
}

export function measure(c: Criterion, trades: readonly Trade[], step: PathStep): CriterionProgress {
  if (c.kind === 'manual') {
    const s = step.manual_state[c.id];
    const met = Boolean(s?.done);
    return { criterion: c, value: null, n: 0, met, display: met ? 'Confirmed' : 'Not yet' };
  }
  const pool = criterionTrades(c, trades, step);
  const target = c.target ?? 0;
  if (c.metric === 'expectancy') {
    const rs = pool.map((t) => t.r_multiple).filter((r): r is number => r != null);
    if (!rs.length) return { criterion: c, value: null, n: 0, met: false, display: 'No trades yet' };
    const v = rs.reduce((s, r) => s + r, 0) / rs.length;
    return { criterion: c, value: v, n: rs.length, met: compare(v, c.op, target), display: `${signedR(v)} over ${rs.length}` };
  }
  if (c.metric === 'pct_pre_graded') {
    if (!pool.length) return { criterion: c, value: null, n: 0, met: false, display: 'No trades yet' };
    const v = (pool.filter((t) => !t.graded_post_hoc).length / pool.length) * 100;
    return { criterion: c, value: v, n: pool.length, met: compare(v, c.op, target), display: `${Math.round(v)}% of ${pool.length}` };
  }
  const v = pool.length;
  return { criterion: c, value: v, n: v, met: compare(v, c.op, target), display: `${v} / ${target}` };
}

function nextActionFor(step: PathStep, progress: CriterionProgress[]): string {
  if (step.next_action?.trim()) return step.next_action.trim();
  const open = progress.find((p) => !p.met);
  if (!open) return 'Every criterion is met.';
  const c = open.criterion;
  if (c.kind === 'manual') {
    return c.proof === 'screenshot_or_note' ? `${c.label} — confirm it with a screenshot or a note.`
      : c.proof === 'note' ? `${c.label} — confirm it with a note.` : c.label;
  }
  if (c.metric === 'count') {
    const left = Math.max(0, (c.target ?? 0) - (open.value ?? 0) + (c.op === '>' ? 1 : 0));
    // "FX Replay trades…" keeps its capitals; "Demo trades…" reads "demo trades…".
    const label = /^[A-Z][a-z]/.test(c.label) ? c.label.charAt(0).toLowerCase() + c.label.slice(1) : c.label;
    return `${left} more: ${label}.`;
  }
  if (c.metric === 'expectancy') {
    return open.value == null ? `${c.label} — no trades to measure yet.`
      : `${c.label} — now ${signedR(open.value)} over ${open.n}.`;
  }
  return c.label;
}

function headlineFor(progress: CriterionProgress[]): string {
  const p = progress.find((x) => !x.met) ?? progress[0];
  if (!p) return '';
  const short = p.criterion.short ?? p.criterion.label;
  return p.criterion.kind === 'manual' ? `${short}: ${p.display.toLowerCase()}` : `${p.display} ${short}`;
}

/** Every step with its status and progress, in order. */
export function derivePath(steps: readonly PathStep[], trades: readonly Trade[]): StepView[] {
  const ordered = [...steps].sort((a, b) => a.position - b.position);
  let activeFound = false;
  return ordered.map((step) => {
    const progress = step.criteria.map((c) => measure(c, trades, step));
    const complete = progress.length > 0 && progress.every((p) => p.met);
    let status: StepStatus;
    if (step.completed_at) status = 'done';
    else if (!activeFound) { status = 'active'; activeFound = true; }
    else status = 'locked';
    return { ...step, status, progress, complete, nextAction: nextActionFor(step, progress), headline: headlineFor(progress) };
  });
}

export const activeStep = (views: readonly StepView[]): StepView | null => views.find((v) => v.status === 'active') ?? null;

/** "Step 1 of 6 · Backtest sample · 14 / 50 graded before outcome" */
export function bannerText(views: readonly StepView[]): string {
  const a = activeStep(views);
  if (!a) return views.length ? 'Path complete' : '';
  const i = views.indexOf(a) + 1;
  return [`Step ${i} of ${views.length}`, a.title, a.headline].filter(Boolean).join(' · ');
}

export interface HeldCommitment { commitment: Commitment; step: Pick<StepView, 'id' | 'title' | 'position'> }

/** Promises in force: those on every step not yet done. */
export function heldCommitments(views: readonly StepView[]): HeldCommitment[] {
  return views.filter((v) => v.status !== 'done').flatMap((v) =>
    v.commitments.map((commitment) => ({ commitment, step: { id: v.id, title: v.title, position: v.position } })));
}

export interface BudgetUse { evals: number; dollars: number }

export const budgetUse = (purchases: readonly EvalPurchase[]): BudgetUse =>
  ({ evals: purchases.length, dollars: purchases.reduce((s, p) => s + p.cost, 0) });

/**
 * Which promises an action would break.
 *
 * `account`: a trade filed under it. `purchase`: an eval about to be bought,
 * measured against the budget of the step holding the promise.
 */
export function brokenBy(
  action: { account?: string; purchase?: { cost: number } },
  views: readonly StepView[],
  purchases: readonly EvalPurchase[] = [],
): HeldCommitment[] {
  const used = budgetUse(purchases);
  return heldCommitments(views).filter(({ commitment: { guard }, step }) => {
    if (action.account && guard.accounts?.includes(action.account)) return true;
    if (action.purchase && guard.evalPurchase) return true;
    if (action.purchase && guard.overBudget) {
      const budget = views.find((v) => v.id === step.id)?.budget;
      if (!budget) return false;
      return used.evals + 1 > budget.max_evals || used.dollars + action.purchase.cost > budget.max_dollars;
    }
    return false;
  });
}

/** The week a date falls in, as its Monday (YYYY-MM-DD), in local time. */
export function weekStart(d: Date): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

/** Saturday or Sunday, local. */
export const isWeekend = (d: Date): boolean => d.getDay() === 0 || d.getDay() === 6;
