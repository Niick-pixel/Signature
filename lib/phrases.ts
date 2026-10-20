/**
 * The phrase dictionary: how I write each mistake.
 *
 * Edit freely. Each theme lists the phrases that mean it, in my own words —
 * a plain string matches as whole words, case-insensitive ("no clean target"
 * also matches "No clean target,"), and `*` in a string stands for up to three
 * words ("unsure * target" matches "unsure of the target"). A RegExp is used
 * as written, for the cases a phrase cannot say (negations, alternatives).
 *
 * Used by the pattern detection in lib/insights.ts — the Stats page's "Learn
 * from your mistakes", the review engine (lib/review.ts) and the home cards.
 * A sentence matching any phrase of a theme counts that theme on its trade.
 */

export type Phrase = string | RegExp;

export const PHRASES: Record<string, Phrase[]> = {
  target: [
    // Plain phrases, as I write them.
    'felt no attraction',
    'unsure * target',
    'no clean target',
    'target was unclear',
      /\b(no|lack of|without|unclear|weak|random|not (a |that |the )?(clean|strong|good|great|powerful)|unsure (of|about)( the)?|not sure (of|about|when))\b[^.,;\n]{0,25}\btargets?\b/i,
      /\btargets?\b[^.,;\n]{0,30}\b(unclear|not (that )?(strong|clean|great|accurate|good)|too ambitious|weak|failed)/i,
      /\b(had|have|felt|feel|feels|with) no attraction\b/i,
      /\bno (clean |strong |good )?(draw|target)\b/i,
      /\bnot (a |that )?(good|strong|great) draw\b/i,
      /\bdraw on liquidity (was|is) (not|no)\b/i,
      /\b(r?eq[hl]s?)\b[^.\n]{0,40}\b(not accurate|not (that )?strong|unsure|not sure|does not cause|no attraction)/i,
      /\btrouble with the target/i,
      /\bfind(ing)? better targets\b/i,
  ],
  late: [
    // Plain phrases, as I write them.
    'already late',
      /\b(entered|enter|entering|entry|in)\b[^.,;\n]{0,20}\b(too )?late\b/i,
      /\blate entry\b/i,
      /\bchas(e|ed|ing)\b/i,
      /\bfomo\b|\bfear of missing out\b/i,
      /\bmissed the (initial|first)\b/i,
  ],
  early: [
    // Plain phrases, as I write them.
    'waited for extra confirmation',
      /\b(too soon|too early)\b/i,
      /\bbefore the (sweep|close|candle closed?)\b/i,
      /\b(without|missing|lack of)( certain| a| the| any)? confirmations?\b/i,
  ],
  bias: [
      // Not "no longs due to not going against my bias" — that is following it.
      /(?<!\bnot (?:going |trading |being )?)\bagainst (my |the )?(htf )?bias\b/i,
      /\bagainst the (htf )?trend\b/i,
      /\bcounter[- ]?trend\b/i,
      /\bdid not check (the )?bias|\bdidn'?t check (the )?bias/i,
  ],
  pd: [
      /\blongs?\b[^.,;\n]{0,15}\b(on|in|from|at) (premium|equilibrium)\b/i,
      /\bshorts?\b[^.,;\n]{0,15}\b(on|in|from|at) (discount|equilibrium)\b/i,
      /\b(buy|buying) (on|in) premium\b|\b(sell|selling) (on|in) discount\b/i,
      /\b(was|price was|it was|close to|entered) (on |in |at )?equilibrium\b/i,
      /\bfib( retracement| range)?\b/i,
  ],
  sweep: [
    // Plain phrases, as I write them.
    'lack of liquidity grab',
    'no liquidity grab',
      /\bno (liquidity )?sweep\b|\bwithout a sweep\b|\bno (itl|ith|liquidity) swept\b/i,
      /\b(no|lack of|without)\b[^.,;\n]{0,15}\b(liquidity( grab| sweep)?|fuel)\b/i,
      /\b(no|not enough|enough|lack of|didn'?t have|did not have(n't)?|did not had) (the )?fuel\b/i,
      /\bnot fueling\b/i,
      /\bbut the sweep level\b/i,
  ],
  fear: [
      /\b(afraid|scared|fearful|nervous)\b/i,
      /\b(fear)\b(?! of missing)/i,
      /\b(doubts?|hesitat\w*)\b/i,
      /\b(unsure|not sure|uncertain)\b/i,
  ],
  momentum: [
    // Plain phrases, as I write them.
    'took some time to go through',
    'more than 4 candles',
      /\bstall(ed|ing|s)?\b/i,
      /\bslow(ed|ing)?( down)?\b|\bslow price action\b/i,
      /\bmomentum (was )?not there\b|\bno momentum\b|\black of momentum\b|\bwithout momentum\b/i,
      /\bnot much volume\b|\bno volume\b/i,
  ],
  stop: [
      /\b(sl|stop( loss)?)\b[^.,;\n]{0,30}\b(inside|too tight|too close|a little wider|wider until)\b/i,
      /\bplaced the (sl|stop) inside\b/i,
  ],
  breakeven: [
      /\bmoved (my |the )?stop\b/i,
      /\b(break ?even|be)\b[^.,;\n]{0,25}\b(got hit|was hit|hit|got stopped|came back)\b/i,
      /\bended up on 0\.\d+r\b/i,
  ],
  prep: [
      /\bforg(o|e)t to (draw|mark)\b/i,
      /\b(did not|didn'?t) (mark|draw|check)\b/i,
      /\bmissed key steps\b|\bmissed this entirely\b/i,
      /\b(i had no htf|no htf\b|lack(ed)? a htf)/i,
      /\bdistracted\b/i,
  ],
  overtrading: [
      /\brevenge\b|\btilt(ed)?\b|\bloss streak\b/i,
      /\bmax 2 losses\b|\bdecided to (long|short) again\b/i,
      /\banother entry on this day\b/i,
  ],
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A phrase as a pattern: whole words, any case, `*` = up to three words. */
export function compilePhrase(p: Phrase): RegExp {
  if (p instanceof RegExp) return p.flags.includes('i') ? p : new RegExp(p.source, `${p.flags}i`);
  const parts = p.trim().split(/\s*\*\s*/).map((w) => escape(w).replace(/\s+/g, '\\s+'));
  return new RegExp(`\\b${parts.join('(?:\\s+\\S+){0,3}\\s+')}\\b`, 'i');
}

/** The compiled patterns for a theme (empty for a theme with no phrases). */
export function patternsFor(theme: string): RegExp[] {
  return (PHRASES[theme] ?? []).map(compilePhrase);
}
