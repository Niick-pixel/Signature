import {
  TAKE_IT_THRESHOLD, isScored, type ChecklistAnswer, type ChecklistKey, type LegacyChecklistKey, type SweepTier,
} from './domain';
import { GATES_SINCE, gradeUnder } from './rubric';

/**
 * Everything the derivation needs, and nothing else — so it can be computed
 * from a saved row, from a half-filled form, or from an imported record.
 */
/**
 * Everything the derivation needs — the nine checklist answers included, so
 * "was this scored at all" is computed here rather than trusted from a caller.
 */
export type AdherenceInput = {
  trigger_fired: boolean;
  checklist_score: number;
  /** Carried, never counted: tags are notes on what went against a trade, not a verdict on it. */
  mistake_tags?: readonly string[];
  /** Rubric 2's gates need these; a trade graded under rubric 1 was never held to them. */
  rubric_version?: number;
  sweep_tier?: SweepTier | null;
  target_type?: string;
  /** Taken below the minimum confidence (026): a rule broken. Null on every older trade. */
  below_min_confidence?: boolean | null;
} & Partial<Record<ChecklistKey | LegacyChecklistKey, ChecklistAnswer>>;

/**
 * Whether the trade failed rubric 2's model gate: no nameable sweep, or not
 * one clean gap. That is not the model, so taking it breaks the plan however
 * high the rest of the checklist scored — the grade caps at C for the same
 * reason. The diagonal cap is not a gate: a B trade is still the model.
 */
export function failedModelGate(t: AdherenceInput): boolean {
  return (t.rubric_version ?? 1) >= GATES_SINCE
    && gradeUnder(t.rubric_version ?? 1, t).caps.some((c) => c.id === 'model');
}

/**
 * Whether the rules were actually followed, computed rather than asked.
 *
 * Self-reporting is the weakest data in the journal: it is answered at the
 * moment I am least able to be objective, about the thing I am least willing
 * to be objective about. The checklist already contains the answer, so take
 * it from there.
 *
 * The "What went wrong" tags are deliberately NOT part of it. They are used
 * to note anything that went against a trade — the market not following the
 * plan, a news spike, a wick — much of it outside my control. Counting any
 * tag as a broken rule marked winners that followed the plan to the letter
 * as rule breaks.
 */
export type Adherence = 'followed' | 'broken' | 'unscored';

/**
 * Whether the rules were followed, computed rather than asked.
 *
 * Three outcomes, not two. A trade whose checklist was never filled in is
 * NOT a rule break — it is a trade I did not score, and calling it a break
 * asserts something about my behaviour from the absence of data. That is the
 * same mistake as the form defaulting "followed all rules" to yes, pointing
 * the other way: silence read as a verdict.
 *
 * Once the checklist HAS been answered, every condition has to hold. A trade
 * can score 100 and still be a break if the trigger never fired; and under
 * rubric 2 it can score 85 and still be a break if it failed a gate — not the
 * model. The tags never decide it (see above).
 */
export function adherenceOf(t: AdherenceInput): Adherence {
  if (!isScored(t)) return 'unscored';
  return t.trigger_fired
    && t.checklist_score >= TAKE_IT_THRESHOLD
    && !failedModelGate(t)
    // Confidence under the minimum is a no-trade by my rules — a rule, not a tag.
    && t.below_min_confidence !== true
    ? 'followed'
    : 'broken';
}

/** Convenience for the places that only care about a clean pass. */
export function derivedAdherence(t: AdherenceInput): boolean {
  return adherenceOf(t) === 'followed';
}

/**
 * The gap between what I said and what the record shows.
 *
 * 'overclaimed' is the one that matters: I said I followed every rule and the
 * checklist disagrees. That number falling over time is real progress, and it
 * is the only measure here that cannot be gamed by being harder on myself —
 * being harsh shows up as 'underclaimed' instead.
 */
export interface AdherenceGap {
  /** Trades where the question was actually answered. */
  answered: number;
  agreed: number;
  /** Said yes, the checklist says no. */
  overclaimed: number;
  /** Said no, the checklist says yes. */
  underclaimed: number;
  /** Never answered — not counted in the gap, but worth seeing. */
  unanswered: number;
  /** overclaimed / answered. Null until something has been answered. */
  overclaimRate: number | null;
}

export function adherenceGap(
  trades: Array<{ followed_rules: boolean | null } & AdherenceInput>,
): AdherenceGap {
  let agreed = 0;
  let overclaimed = 0;
  let underclaimed = 0;
  let unanswered = 0;

  for (const t of trades) {
    // No self-report, or nothing to compare it against.
    if (t.followed_rules === null || adherenceOf(t) === 'unscored') { unanswered += 1; continue; }
    const derived = derivedAdherence(t);
    if (t.followed_rules === derived) agreed += 1;
    else if (t.followed_rules) overclaimed += 1;
    else underclaimed += 1;
  }

  const answered = agreed + overclaimed + underclaimed;
  return {
    answered,
    agreed,
    overclaimed,
    underclaimed,
    unanswered,
    overclaimRate: answered ? overclaimed / answered : null,
  };
}

export interface GapMonth { month: string; answered: number; overclaimed: number; rate: number | null }

/**
 * The gap, month by month — whether it is closing is the whole point of
 * measuring it. Only months where something was answered are returned, oldest
 * first, the last `months` of them.
 */
export function gapTrend(
  trades: Array<{ date: string; followed_rules: boolean | null } & AdherenceInput>,
  months = 6,
): GapMonth[] {
  const by = new Map<string, typeof trades>();
  for (const t of trades) {
    const m = t.date.slice(0, 7);
    by.set(m, [...(by.get(m) ?? []), t]);
  }
  return [...by.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, list]) => {
      const g = adherenceGap(list);
      return { month, answered: g.answered, overclaimed: g.overclaimed, rate: g.overclaimRate };
    })
    .filter((m) => m.answered > 0)
    .slice(-months);
}
