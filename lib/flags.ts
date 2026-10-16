import { TAKE_IT_THRESHOLD, isHypothetical, isTaken } from './domain';
import type { Trade } from './types';

/**
 * Contradictions in a saved record.
 *
 * These are descriptive, never blocking. Nothing here can stop a save, ask
 * "are you sure", or make a trade unsaveable — a contradictory record of what
 * actually happened is worth infinitely more than a tidy record that was never
 * written. The flag just makes the contradiction visible later, when I am in a
 * state to look at it.
 *
 * Each one is dismissable, because sometimes the contradiction is real and I
 * know exactly why.
 */
export const FLAG_KEYS = [
  'claimed_rules_no_trigger',
  'no_target_named',
  'direction_against_pd',
  'passed_a_good_setup',
  'took_a_bad_setup',
  'taken_failed_target_check',
  'settled_without_r',
  // Retired: no flag is raised under these any more. Kept so dismissals
  // already stored against them still validate.
  // - tags are notes, not rule breaks;
  'claimed_rules_with_mistakes',
  // - the form stopped asking for risk long ago (P&L and R carry the money),
  //   so this one fired on every trade and said nothing.
  'settled_without_risk',
] as const;

export type FlagKey = (typeof FLAG_KEYS)[number];

export interface Flag {
  key: FlagKey;
  label: string;
  detail: string;
}

/*
  Only flags worth stopping for: a record that contradicts itself, a rule of
  the plan broken in a way the record already shows, or a hole that leaves
  the trade out of the numbers. Nothing that fires on every trade, nothing
  already said by a tag I chose, and nothing on a Missed trade that the
  plan would have me glad I missed.
*/
const RULES: Array<{ key: FlagKey; label: string; test: (t: Trade) => string | null }> = [
  {
    key: 'claimed_rules_no_trigger',
    label: 'Said rules followed, but Phase 3 never fired',
    test: (t) => (t.followed_rules === true && !t.trigger_fired)
      ? 'Without both Phase 3 answers the plan says this entry does not exist, so it cannot also be a trade that followed every rule.'
      : null,
  },
  {
    key: 'took_a_bad_setup',
    label: 'Taken below the standard',
    test: (t) => (taken(t) && t.checklist_score < TAKE_IT_THRESHOLD)
      ? `Scored ${t.checklist_score}, under the ${TAKE_IT_THRESHOLD} line.`
      : null,
  },
  {
    key: 'taken_failed_target_check',
    label: 'Taken although the target check failed',
    test: (t) => (taken(t) && t.target_check_passed === false)
      ? 'Under 1.5R to the nearest liquidity, too many swings in the way, or the target was not the nearest pool. By your rules this was no trade.'
      : null,
  },
  {
    key: 'passed_a_good_setup',
    label: 'Passed on a setup that met the standard',
    test: (t) => (!isTaken(t.outcome) && t.status !== 'Planned' && t.checklist_score >= TAKE_IT_THRESHOLD && t.trigger_fired)
      ? `Scored ${t.checklist_score} with the trigger fired. By the plan, taking it was the rule.`
      : null,
  },
  {
    key: 'direction_against_pd',
    label: 'Direction against premium / discount',
    test: (t) => {
      if (!taken(t)) return null;
      // Already said by a tag I chose: no need to say it twice.
      if (t.mistake_tags.includes('Long in premium') || t.mistake_tags.includes('Short in discount')) return null;
      if (t.direction === 'Long' && t.premium_discount === 'Premium') {
        return 'Long from premium — buying where the discount buyers are taking profit.';
      }
      if (t.direction === 'Short' && t.premium_discount === 'Discount') {
        return 'Short from discount — selling into where the buyers are.';
      }
      return null;
    },
  },
  {
    key: 'no_target_named',
    label: 'Taken with no target named',
    test: (t) => (taken(t) && t.target_type === 'Other' && !t.mistake_tags.includes('No defined target'))
      ? 'A target you cannot name is a target you cannot be wrong about.'
      : null,
  },
  {
    key: 'settled_without_r',
    label: 'No R recorded',
    test: (t) => (isTaken(t.outcome) && t.status !== 'Planned' && t.r_multiple == null)
      ? 'Without an R this trade is left out of every R figure — expectancy, win rate by R, the curve.'
      : null,
  },
];

/** Taken for real: a Missed trade was not, and a plan has not been yet. */
const taken = (t: Trade) => isTaken(t.outcome) && t.status !== 'Planned' && !isHypothetical(t.account);

/** Every contradiction in a trade, dismissed ones included. */
export function flagsFor(trade: Trade): Flag[] {
  const out: Flag[] = [];
  for (const rule of RULES) {
    const detail = rule.test(trade);
    if (detail) out.push({ key: rule.key, label: rule.label, detail });
  }
  return out;
}

/** The ones still asking for an answer — what the amber dot counts. */
export function openFlagsFor(trade: Trade): Flag[] {
  const dismissed = new Set(Object.keys(trade.dismissed_flags ?? {}));
  return flagsFor(trade).filter((f) => !dismissed.has(f.key));
}

export function hasOpenFlags(trade: Trade): boolean {
  return openFlagsFor(trade).length > 0;
}
