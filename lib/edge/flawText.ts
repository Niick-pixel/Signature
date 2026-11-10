/**
 * The words on a flaw card that are not numbers: why a flaw costs you, and
 * the drill — one if-then rule to follow next session. A static map, meant
 * to be edited here; a drill you rewrite on the card is saved per flaw
 * (db/flaws) and wins over this text.
 *
 * Every drill adds discipline that is already in the plan. None loosens a
 * written rule (CLAUDE.md rule 7): `tightens` names the plan rule a drill
 * enforces, or null when it is pure process (grading, journaling).
 */
export type FlawType = 'theme' | 'rule' | 'repeat' | 'early-be' | 'never-positive' | 'tilt' | 'filter' | 'hesitation' | 'data';

export interface FlawText {
  why: string;
  drill: string;
  /** The written rule this drill enforces (a rule-book id), or null for process drills. Never a rule it relaxes. */
  tightens: string | null;
}

/** Keyed by flaw key, or by theme id for mistake themes and repeated lessons. */
export const FLAW_TEXT: Record<string, FlawText> = {
  early: {
    why: 'An inversion only exists once the candle closes through the FVG. Before the close you are guessing which side wins, and your losses here are full −1R.',
    drill: 'I enter only after the inversion candle has closed through the FVG. If I am in before the close, I log it as a break.',
    tightens: 'trigger',
  },
  breakeven: {
    why: 'Normal retracement takes out a breakeven stop before the move pays. You turn 2R winners into scratches and keep the full losses.',
    drill: 'My stop stays where I placed it until price reaches +1R.',
    tightens: 'management',
  },
  'exec:early-be': {
    why: 'Normal retracement takes out a breakeven stop before the move pays. You turn 2R winners into scratches and keep the full losses.',
    drill: 'My stop stays where I placed it until price reaches +1R.',
    tightens: 'management',
  },
  'exec:never-positive': {
    why: 'If price never moves your way, the problem is the pick or the entry, not management. Look at the draw on liquidity.',
    drill: 'Before entry I write the draw on liquidity I expect price to reach. No named draw, no trade.',
    tightens: 'target',
  },
  target: {
    why: 'Price needs a reason to travel. Without a clean, untested pool there is no attraction, and it stalls.',
    drill: 'Before entry I name the pool (EQH/EQL, PDH/PDL, session H/L, data wick). If I cannot name a clean, untested one, no trade.',
    tightens: 'target',
  },
  'tilt:after-loss': {
    why: 'The second trade is taken by a different mind than the first.',
    drill: 'After a loss I stand up for 10 minutes before the next chart.',
    tightens: 'cooldown',
  },
  'tilt:second-plus': {
    why: 'The second trade is taken by a different mind than the first.',
    drill: 'After my first trade of the day, I stand up for 10 minutes before looking at another chart.',
    tightens: 'max-trades',
  },
  filter: {
    why: 'A filter that says yes to everything is not a filter. It confirms a decision you already made.',
    drill: 'I grade before entry, and do 20 blind re-grades this week.',
    tightens: null,
  },
  hesitation: {
    why: 'Setups you skip score like the ones you take. The skip is fear, not filtering, and it costs the winners the plan already chose.',
    drill: 'When the checklist passes and the trigger fires, I take it at planned size. If I skip, I write why before price moves.',
    tightens: null,
  },
  data: {
    why: 'The engine can only read what you log. With Setup detail missing, every flaw it finds is a guess.',
    drill: 'I fill in Setup detail on every trade.',
    tightens: null,
  },
};

/** A rule break's card text, when the library has no entry for that rule. */
export function ruleText(short: string): FlawText {
  return {
    why: 'A rule you wrote is a decision made calmly. Breaking it in the moment trades that decision for a feeling.',
    drill: `I keep the rule: ${short.toLowerCase()}. If I break it, I log it as a break.`,
    tightens: null,
  };
}

/** A theme's text: the library's when it has one, else the theme's own if-then rule (lib/insights). */
export function themeText(id: string, rule: string, why: string): FlawText {
  return FLAW_TEXT[id] ?? { why, drill: rule, tightens: null };
}
