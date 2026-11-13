import { TARGET_TYPES } from './domain';

/**
 * The morning prep: the second half of the check-in, done on the chart before
 * the New York session. Top-down, and every answer written down, so the
 * morning ends with two plans instead of a list of ticks:
 *
 *   1. News        any red folder today, and when; inside NY AM, the rule
 *   2. HTF bias    "4H/1H bias is ___ because ___. Invalidated by a 1H body
 *                  close beyond ___." Can't fill it honestly: neutral, A+ only
 *   3. Overnight   Asia, London, PDH/PDL (and PWH/PWL): which were run, which
 *                  are still there — the side taken says where the draw is
 *   4. The map     the nearest named level above and below (type, major or
 *                  minor, fresh or tapped) and any 1H/4H gap in between
 *   5. Location    premium or discount of the overnight range
 *   6. The plans   Scenario A (with bias) and B (the alternate), written the
 *                  same way every day, and C: neither — no trade
 *
 * Three rules make the plans work, and the prep checks them as you write
 * (a note, never a gate): A and B must differ in which liquidity is taken
 * first; each needs a kill switch, or it is a hope, not a plan; and C is
 * always there, so "no trade" counts as following the plan.
 *
 * The decisions the rest of the app reads keep their keys: the side
 * (draw.side), the sweeps to wait for (liquidity.wait), the target
 * (draw.target), the direction, the news and the stop rule are derived from
 * the written plans (deriveDecisions), so plan match, the plan grade and the
 * stop rule work unchanged.
 *
 * The two versions before are kept, to read what was saved under them:
 * LEGACY_STEPS (six tap steps) and PANEL_STEPS (three steps around the
 * TradingView panel). Like the check-in this is a prompt, never a gate.
 * Times are New York time, the clock the sessions are defined on.
 */

/** One tap-to-answer question on a step. */
export interface PrepField {
  id: string;
  label: string;
  /** one — a single pill; many — any number of pills; pick — a dropdown; text — written down. */
  kind: 'one' | 'many' | 'pick' | 'text';
  /** The choices (none for text). */
  options: string[];
  /** For text: what a good answer looks like. */
  placeholder?: string;
  /** For text: a few lines rather than one. */
  long?: boolean;
  /** No longer asked; answers already saved still read (plan match, exports). */
  hidden?: boolean;
  /** For many: at most this many; a tap past it lets go of the oldest. */
  max?: number;
  /**
   * The answer's stored key, when it is not "step.field": a question that
   * moved to another step keeps the key it was saved under, so everything
   * reading it (plan match, the plan grade, the stop rule) still finds it.
   */
  key?: string;
}

export interface PrepStep {
  id: string;
  title: string;
  /** The timeframes to look at for this step. */
  frames?: string;
  /** What to draw, one line per mark — each ticked as it goes on the chart. */
  marks: string[];
  /**
   * Marks no longer asked for, by position. Ticks are stored by position, so
   * a retired mark keeps its place (old preps still line up) and is just
   * never shown or counted.
   */
  retired?: number[];
  fields: PrepField[];
  /** Offers the order-book heatmap link. */
  heatmap?: boolean;
}

/** Where "already run" is stored (TAKEN_KEY below; the same key every version used). */
const TAKEN_KEY_ = 'liquidity.taken';

/** The nameable levels a sweep can take — the same names the trade form uses. */
const SWEEPABLE = ['PDH', 'PDL', 'PWH', 'PWL', 'Asia high', 'Asia low', 'London high', 'London low', 'EQH', 'EQL'];

/*
  Answer ids are kept from the previous version (bias.bias, liquidity.taken,
  draw.target, …) so a prep saved under it still reads; the new answers only
  add to them.
*/
export const LEGACY_STEPS: PrepStep[] = [
  {
    id: 'bias', title: 'Bias', frames: 'Daily · 4H',
    marks: [
      'Daily and 4H swing high and low marked',
      'The 50% of that range drawn — premium above, discount below',
      'Nearest unfilled Daily / 4H FVG boxed, above and below',
    ],
    fields: [
      { id: 'bias', label: 'HTF bias', kind: 'one', options: ['Bullish', 'Bearish', 'No clear bias'] },
      { id: 'zone', label: 'Price is in', kind: 'one', options: ['Premium', 'Equilibrium', 'Discount'] },
    ],
  },
  {
    id: 'liquidity', title: 'Liquidity to sweep', frames: 'Daily · 1H · 15m',
    marks: [
      'PDH and PDL lined',
      'PWH and PWL lined',
      'Asia and London highs and lows on the chart',
      'Clean equal highs and lows marked — the obvious ones',
      'The levels closest to price circled',
    ],
    fields: [
      { id: 'taken', label: 'Already taken', kind: 'many', options: SWEEPABLE },
      { id: 'clean', label: 'Clean resting liquidity', kind: 'one', options: ['EQH above', 'EQL below', 'Both sides', 'None clean'] },
      { id: 'wait', label: 'Sweep to wait for', kind: 'many', options: SWEEPABLE },
    ],
  },
  {
    id: 'gaps', title: 'HTF gaps', frames: '4H · 1H · 30m · 15m · 10m · 5m',
    marks: [
      'FVGs in the direction price is moving searched and added — 5m, 10m, 15m, 30m, 1H, 4H',
      'Unfilled 4H FVGs boxed',
      'Unfilled 1H FVGs boxed',
      'NWOG / NDOG marked',
      'Gaps already traded through taken off the chart',
    ],
    fields: [
      { id: 'types', label: 'On the chart today', kind: 'many', options: ['Daily FVG', '4H FVG', '1H FVG', '30m FVG', '15m FVG', '10m FVG', '5m FVG', 'NWOG', 'NDOG'] },
      { id: 'nearest', label: 'Nearest unfilled HTF FVG', kind: 'one', options: ['Above price', 'Below price', 'Both sides', 'None close'] },
    ],
  },
  {
    id: 'heatmap', title: 'Liquidity from the heatmap', frames: 'Order book', heatmap: true,
    marks: [
      'Heatmap open on the futures book',
      'Bands that held for hours moved to the chart',
      'Flickering bands ignored — spoofing, not liquidity',
    ],
    fields: [
      { id: 'side', label: 'Heaviest liquidity sits', kind: 'one', options: ['Above price', 'Below price', 'Both sides', 'Thin book'] },
      { id: 'walls', label: 'The walls are', kind: 'one', options: ['Holding', 'Being pulled', 'Mixed'] },
    ],
  },
  {
    id: 'draw', title: 'Draw and plan',
    marks: [
      'Draw on liquidity marked — where price is most likely heading',
      'Target marked, from the strongest class in range',
      'Invalidation marked — where the idea is wrong',
      'Alerts set on the sweep levels',
    ],
    fields: [
      { id: 'direction', label: 'Price draws', kind: 'one', options: ['Up', 'Down', 'Unclear'] },
      // The same six classes the trade form ranks, strongest first.
      { id: 'target', label: 'Target', kind: 'pick', options: [...TARGET_TYPES] },
      { id: 'confidence', label: 'How clear', kind: 'one', options: ['Clear', 'Probable', 'Coin flip'] },
      { id: 'side', label: 'Today I take', kind: 'one', options: ['Longs only', 'Shorts only', 'Both ways', 'No trade today'] },
    ],
  },
  {
    id: 'session', title: 'Session and rules', frames: 'NY AM', retired: [1],
    marks: [
      'Red-folder release times lined',
      // Retired: the platform shades the killzone on its own.
      'NY AM killzone shaded',
      'Only the model: a named sweep, one clean FVG, an inversion close',
      'Daily loss limit set in the platform',
      'Step away until an alert rings',
    ],
    fields: [
      { id: 'news', label: 'News', kind: 'one', options: ['None today', 'Before the open', 'Inside the killzone'] },
      // Retired from the form: the session is the same every day. Old answers still read.
      { id: 'first', label: 'First entry', kind: 'pick', options: ['From the open (9:30)', 'After 9:45', 'After 10:00', '15 min after the news'], hidden: true },
      { id: 'done', label: 'Done by', kind: 'pick', options: ['11:00', '11:30', '12:00', 'The close'], hidden: true },
      { id: 'stop', label: 'Stop after', kind: 'one', options: ['1 loss', '2 losses', 'Daily limit'] },
    ],
  },
];


/** Levels the script's Above and Below rows name. */
const PANEL_LEVELS = ['PDH', 'PDL', 'PWH', 'PWL', 'Asia high', 'Asia low', 'London high', 'London low', 'NY AM high', 'NY AM low',
  'EQH', 'EQL', 'Data high', 'Data low', '$ internal', 'LRLR'];

/** The second version: three steps around the TradingView panel. Kept to read what was saved under it. */
export const PANEL_STEPS: PrepStep[] = [
  {
    id: 'panel', title: 'Read the panel', frames: 'The script',
    marks: [
      'Script on the chart, on Costa Rica time, daylight saving on Auto',
      'HTF bias row read — 1H and 4H, and how far the invalidation is',
      'Above and Below rows read — the nearest untaken level each side, and whether it is major',
    ],
    fields: [
      { id: 'h1', label: '1H', kind: 'one', options: ['Bullish', 'Bearish'] },
      { id: 'h4', label: '4H', kind: 'one', options: ['Bullish', 'Bearish', 'Stale'] },
      { id: 'conflict', label: 'HTF / LTF conflict', kind: 'one', options: ['A+ only showing', 'No conflict'] },
      { id: 'inv', label: '1H inv', kind: 'one', options: ['Close — in range today', 'Far', 'Stale'] },
      { id: 'above', label: 'Nearest above', kind: 'pick', options: PANEL_LEVELS },
      { id: 'aboveTier', label: 'Above is', kind: 'one', options: ['Major', 'Minor'] },
      { id: 'below', label: 'Nearest below', kind: 'pick', options: PANEL_LEVELS },
      { id: 'belowTier', label: 'Below is', kind: 'one', options: ['Major', 'Minor'] },
    ],
  },
  {
    // Kept as "heatmap" so the heatmap answers saved before still belong to it.
    id: 'heatmap', title: 'Off the script', frames: 'Order book · Daily', heatmap: true,
    marks: [
      'Heatmap open on the futures book',
      'Bands that held for hours moved to the chart',
      'Flickering bands ignored — spoofing, not liquidity',
      'Daily FVGs above and below boxed — the script stops at 4H',
      'NDOG marked',
      "NWOG marked — the script's one is not working yet",
    ],
    fields: [
      { id: 'side', label: 'Heaviest liquidity sits', kind: 'one', options: ['Above price', 'Below price', 'Both sides', 'Thin book'] },
      { id: 'walls', label: 'The walls are', kind: 'one', options: ['Holding', 'Being pulled', 'Mixed'] },
      { id: 'daily', label: 'Nearest Daily FVG', kind: 'one', options: ['Above price', 'Below price', 'Both sides', 'None close'] },
    ],
  },
  {
    id: 'plan', title: 'Plan and rules', frames: 'NY AM',
    marks: [
      'Draw on liquidity decided — where price is most likely heading',
      'Only the model: a named sweep, one clean FVG, an inversion close',
      'Daily loss limit set in the platform',
      'Step away until an alert rings',
    ],
    fields: [
      { id: 'wait', key: 'liquidity.wait', label: 'Sweep to wait for', kind: 'many', options: SWEEPABLE },
      { id: 'direction', key: 'draw.direction', label: 'Price draws', kind: 'one', options: ['Up', 'Down', 'Unclear'] },
      // The same six classes the trade form ranks, strongest first.
      { id: 'target', key: 'draw.target', label: 'Target', kind: 'pick', options: [...TARGET_TYPES] },
      { id: 'confidence', key: 'draw.confidence', label: 'How clear', kind: 'one', options: ['Clear', 'Probable', 'Coin flip'] },
      { id: 'side', key: 'draw.side', label: 'Today I take', kind: 'one', options: ['Longs only', 'Shorts only', 'Both ways', 'No trade today'] },
      { id: 'news', key: 'session.news', label: 'News', kind: 'one', options: ['None today', 'Before the open', 'Inside the killzone'] },
      { id: 'stop', key: 'session.stop', label: 'Stop after', kind: 'one', options: ['1 loss', '2 losses', 'Daily limit'] },
    ],
  },
];

/** Overnight and weekly levels: which were run before the open. */
export const OVERNIGHT = ['Asia high', 'Asia low', 'London high', 'London low', 'PDH', 'PDL', 'PWH', 'PWL'];
const HIGHS = new Set(['Asia high', 'London high', 'PDH', 'PWH']);
/** Where a scenario starts: a named level to be swept, or an HTF gap to be delivered into. */
const TRIGGERS = [...SWEEPABLE, '1H gap', '4H gap'];
export const RR_BANDS = ['<1.5', '1.5–2', '2+'];
/*
  The plans are tapped, not written (049 of the prep, no migration: answers are
  JSON). Each written question is kept hidden so a prep saved with it still
  reads — everything below prefers the tapped answer and falls back to the words.
*/
/** Trigger zones: a level to sweep or a gap to be delivered into. A long waits below, a short above. */
export const PREP_ZONES = [...SWEEPABLE, 'ITH', 'ITL', 'Data wick', '5m gap', '15m gap', '1H gap', '4H gap'];
const LOWS_ONLY = new Set(['PDL', 'PWL', 'Asia low', 'London low', 'EQL', 'ITL']);
const HIGHS_ONLY = new Set(['PDH', 'PWH', 'Asia high', 'London high', 'EQH', 'ITH']);
/** The levels on the wrong side for this direction: a long's zone is below price, its target above. */
export const wrongSide = (dir: unknown, as: 'zone' | 'target'): string[] => {
  if (dir !== 'Long' && dir !== 'Short') return [];
  const below = (dir === 'Long') === (as === 'zone');
  return [...(below ? HIGHS_ONLY : LOWS_ONLY)];
};
export const PREP_CONFIRMS = ['Sweep + iFVG close', 'HTF FVG delivery + iFVG close', 'Rejected fast', 'Displacement candle', 'CISD', 'SMT with ES', '5m agrees'];
/** The first target, named: the opposite side's liquidity, or the gap that ends the move. */
export const PREP_TARGET_AT = [...SWEEPABLE, 'ITH', 'ITL', 'Session high', 'Session low', 'Data wick', 'Opposing 1H gap', 'Opposing 4H gap'];
export const PREP_KILLS = ['Never reaches the zone', '5m closes through the zone', '15m closes through the zone', 'Opposing HTF gap forms',
  'Not triggered by the cutoff', 'Takes the other side’s liquidity first', 'News spike through the zone', 'Bias invalidated'];
export const HTF_REASONS = ['4H displaced through a level', '1H holding an iFVG', 'HTF FVG respected', 'Swept a HTF high or low',
  '4H structure: higher highs / lower lows', 'Drawing to a weekly level', 'Daily candle direction', 'Rejected a premium / discount'];
export const HTF_INV_AT = ['The 1H iFVG', 'The last 1H swing', 'The 4H FVG', 'PDH / PDL', 'The overnight high / low', 'The weekly open'];
export const CUTOFFS = ['9:45', '10:00', '10:30', '11:00'];

const scenario = (k: 'a' | 'b'): PrepField[] => [
  { id: `${k}Dir`, label: 'Direction', kind: 'one', options: ['Long', 'Short'] },
  { id: `${k}Zones`, label: 'Trigger zone · up to 2', kind: 'many', options: PREP_ZONES, max: 2 },
  { id: `${k}Confirms`, label: 'Confirmation', kind: 'many', options: PREP_CONFIRMS },
  { id: `${k}Target`, label: 'First target', kind: 'pick', options: [...TARGET_TYPES] },
  { id: `${k}TargetAt`, label: 'First target, named', kind: 'one', options: PREP_TARGET_AT },
  { id: `${k}RR`, label: 'Rough R', kind: 'one', options: RR_BANDS },
  { id: `${k}Kills`, label: 'Kill switch', kind: 'many', options: PREP_KILLS },
  // Written, before the plans were tapped: read, never asked.
  { id: `${k}Story`, label: 'Story', kind: 'text', options: [], long: true, hidden: true },
  { id: `${k}Trigger`, label: 'Trigger zone', kind: 'pick', options: TRIGGERS, hidden: true },
  { id: `${k}TriggerNote`, label: 'Trigger zone, exactly', kind: 'text', options: [], hidden: true },
  { id: `${k}Confirm`, label: 'Confirmation, written', kind: 'text', options: [], hidden: true },
  { id: `${k}TargetNote`, label: 'First target, exactly', kind: 'text', options: [], hidden: true },
  { id: `${k}Kill`, label: 'Kill switch, written', kind: 'text', options: [], hidden: true },
];

/** The prep as it is asked now: top-down, written down, ending in two plans. */
export const PREP_STEPS: PrepStep[] = [
  {
    id: 'news', title: 'News', frames: 'Today',
    marks: [],
    fields: [
      { id: 'news', key: 'session.news', label: 'Red folder today', kind: 'one', options: ['None today', 'Before the open', 'Inside the killzone'] },
    ],
  },
  {
    id: 'htf', title: 'HTF bias', frames: '4H · 1H',
    marks: [],
    fields: [
      { id: 'bias', label: '4H/1H bias is', kind: 'one', options: ['Bullish', 'Bearish', 'Neutral'] },
      { id: 'reasons', label: 'because', kind: 'many', options: HTF_REASONS },
      { id: 'invAt', label: 'Invalidated by a 1H body close beyond', kind: 'one', options: HTF_INV_AT },
      { id: 'because', label: 'because, written', kind: 'text', options: [], hidden: true },
      { id: 'inv', label: 'Invalidated beyond, written', kind: 'text', options: [], hidden: true },
    ],
  },
  {
    id: 'overnight', title: 'What was taken overnight', frames: '1H · 15m',
    marks: [],
    fields: [
      { id: 'taken', key: TAKEN_KEY_, label: 'Already run', kind: 'many', options: OVERNIGHT },
    ],
  },
  {
    id: 'map', title: 'The liquidity map', frames: '1H · 4H', heatmap: true,
    marks: [],
    fields: [
      { id: 'above', key: 'panel.above', label: 'Nearest named level above', kind: 'pick', options: PANEL_LEVELS },
      { id: 'aboveTier', key: 'panel.aboveTier', label: 'It is', kind: 'one', options: ['Major', 'Minor'] },
      { id: 'aboveState', label: 'And', kind: 'one', options: ['Fresh', 'Tapped'] },
      { id: 'gapAbove', label: '1H/4H gap between price and it', kind: 'one', options: ['None', '1H gap', '4H gap', 'Both'] },
      { id: 'below', key: 'panel.below', label: 'Nearest named level below', kind: 'pick', options: PANEL_LEVELS },
      { id: 'belowTier', key: 'panel.belowTier', label: 'It is', kind: 'one', options: ['Major', 'Minor'] },
      { id: 'belowState', label: 'And', kind: 'one', options: ['Fresh', 'Tapped'] },
      { id: 'gapBelow', label: '1H/4H gap between price and it', kind: 'one', options: ['None', '1H gap', '4H gap', 'Both'] },
    ],
  },
  {
    id: 'location', title: 'Location', frames: 'The overnight range',
    marks: [],
    fields: [
      { id: 'zone', label: 'Right now, price is in the overnight range’s', kind: 'one', options: ['Premium', 'Equilibrium', 'Discount'] },
    ],
  },
  {
    id: 'plans', title: 'Two plans, and C', frames: 'NY AM',
    marks: ['Alerts set on both trigger zones', 'Daily loss limit set in the platform'],
    fields: [
      ...scenario('a'),
      ...scenario('b'),
      { id: 'cutoffAt', label: 'Cutoff', kind: 'one', options: CUTOFFS },
      { id: 'cutoff', label: 'Cutoff, written', kind: 'text', options: [], hidden: true },
      { id: 'stop', key: 'session.stop', label: 'Stop after', kind: 'one', options: ['1 loss', '2 losses', 'Daily limit'] },
    ],
  },
];

/** Every step a saved prep can hold: the live ones, then the legacy ones (not shown, still read). */
const ALL_STEPS: PrepStep[] = [...PREP_STEPS, ...PANEL_STEPS, ...LEGACY_STEPS.filter((l) => !PANEL_STEPS.some((p) => p.id === l.id))];
const LEGACY_ONLY = new Set(LEGACY_STEPS.map((l) => l.id).filter((id) => !PANEL_STEPS.some((p) => p.id === id)));
const PANEL_IDS = new Set(PANEL_STEPS.map((s) => s.id));

export const answerKey = (step: PrepStep, field: PrepField) => field.key ?? `${step.id}.${field.id}`;

/** Every question by its stored key: the live one wins where both ask it. */
const FIELD_BY_KEY = new Map<string, PrepField>();
for (const st of [...LEGACY_STEPS].reverse().concat(PANEL_STEPS, PREP_STEPS)) for (const f of st.fields) FIELD_BY_KEY.set(answerKey(st, f), f);

export const PREP_STEP_IDS = PREP_STEPS.map((s) => s.id);

export type StepState = 'done' | 'skipped';
export type Answer = string | string[];

export interface PrepData {
  steps: Record<string, StepState>;
  /** Which marks of each step are on the chart. */
  ticks: Record<string, number[]>;
  /** "step.field" → the answer. */
  answers: Record<string, Answer>;
}

export interface SessionPrep {
  day: string;
  data: PrepData;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
}

/** The longest written answer kept. */
export const TEXT_MAX = 400;

export const EMPTY_PREP: PrepData = { steps: {}, ticks: {}, answers: {} };

const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : {});

/**
 * Anything in, a valid prep out. Unknown steps, fields and options are
 * dropped — including whatever an earlier version of the prep stored — and
 * nothing is ever refused.
 */
export function parsePrepData(raw: unknown): PrepData {
  const r = obj(raw);
  const steps: Record<string, StepState> = {};
  for (const [id, v] of Object.entries(obj(r.steps))) {
    if (ALL_STEPS.some((st) => st.id === id) && (v === 'done' || v === 'skipped')) steps[id] = v;
  }
  const ticks: Record<string, number[]> = {};
  for (const [id, v] of Object.entries(obj(r.ticks))) {
    const step = ALL_STEPS.find((s) => s.id === id);
    if (!step || !Array.isArray(v)) continue;
    ticks[id] = [...new Set(v.filter((i): i is number => Number.isInteger(i) && i >= 0 && i < step.marks.length && !step.retired?.includes(i)))].sort();
  }
  const answers: Record<string, Answer> = {};
  for (const [key, v] of Object.entries(obj(r.answers))) {
    const field = FIELD_BY_KEY.get(key);
    if (!field) continue;
    if (field.kind === 'text') {
      // Written answers: one tidy line (or a few), never more than a paragraph.
      if (typeof v === 'string' && v.trim()) answers[key] = v.replace(/\r/g, '').slice(0, TEXT_MAX);
    } else if (field.kind === 'many') {
      const list = Array.isArray(v) ? field.options.filter((o) => v.includes(o)) : [];
      if (list.length) answers[key] = list;
    } else if (typeof v === 'string' && field.options.includes(v)) {
      answers[key] = v;
    }
  }
  return { steps, ticks, answers };
}

/*
  Weekly levels stay taken for the week. PWH and PWL are last week's high and
  low: fixed from Monday to Friday, and once one is swept it is gone until the
  next week starts. Daily levels (PDH/PDL, Asia, London) reset every day.
*/
export const WEEKLY_LEVELS = ['PWH', 'PWL'] as const;
export const TAKEN_KEY = 'liquidity.taken';
export const WAIT_KEY = 'liquidity.wait';

/** The Monday of a day's week (YYYY-MM-DD in, YYYY-MM-DD out). */
export function mondayOf(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const x = new Date(Date.UTC(y, m - 1, d));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
}

/** Weekly levels already taken earlier this week, each with the first day it was marked. */
export function weeklyTaken(preps: readonly SessionPrep[], day: string): Array<{ level: string; day: string }> {
  const monday = mondayOf(day);
  const out = new Map<string, string>();
  for (const p of [...preps].sort((a, b) => a.day.localeCompare(b.day))) {
    if (p.day < monday || p.day >= day) continue;
    const taken = p.data.answers[TAKEN_KEY];
    for (const l of Array.isArray(taken) ? taken : []) {
      if ((WEEKLY_LEVELS as readonly string[]).includes(l) && !out.has(l)) out.set(l, p.day);
    }
  }
  return [...out].map(([level, d]) => ({ level, day: d }));
}

/**
 * A day's prep with this week's taken weekly levels carried in — only when
 * the day has not answered "Already taken" yet, so an answer given today is
 * never overruled. A level already taken is not one to wait for.
 */
export function withWeeklyTaken(data: PrepData, carried: ReadonlyArray<{ level: string }>): PrepData {
  if (!carried.length || data.answers[TAKEN_KEY] !== undefined) return data;
  const answers: Record<string, Answer> = { ...data.answers, [TAKEN_KEY]: carried.map((c) => c.level) };
  const wait = answers[WAIT_KEY];
  if (Array.isArray(wait)) {
    const left = wait.filter((w) => !carried.some((c) => c.level === w));
    if (left.length) answers[WAIT_KEY] = left; else delete answers[WAIT_KEY];
  }
  return { ...data, answers };
}

/** The marks still asked for, each with its stored position. */
export function liveMarks(step: PrepStep): Array<{ text: string; i: number }> {
  return step.marks.map((text, i) => ({ text, i })).filter((m) => !step.retired?.includes(m.i));
}

/** Saved under the six-step prep (it has a state for a step that is no longer asked). */
export const isLegacyPrep = (data: PrepData) => Object.keys(data.steps).some((id) => LEGACY_ONLY.has(id));
/** Saved under the three-step panel prep (and not started in the new one). */
export const isPanelPrep = (data: PrepData) => !isLegacyPrep(data)
  && Object.keys(data.steps).some((id) => PANEL_IDS.has(id)) && !PREP_STEPS.some((st) => data.steps[st.id]);
/** The steps a saved prep was asked under. */
export const stepsOf = (data: PrepData): PrepStep[] => (isLegacyPrep(data) ? LEGACY_STEPS : isPanelPrep(data) ? PANEL_STEPS : PREP_STEPS);

/**
 * How far through. A prep is complete when every step is done — or, for one
 * saved under the six-step version, by its own rule then: 4 of 6.
 */
export function prepProgress(data: PrepData): { answered: number; done: number; total: number; complete: boolean } {
  if (isLegacyPrep(data)) {
    const states = Object.values(data.steps);
    const done = states.filter((s) => s === 'done').length;
    return { answered: states.length, done, total: LEGACY_STEPS.length, complete: done >= 4 };
  }
  const steps = stepsOf(data);
  const live = steps.map((st) => data.steps[st.id]);
  const done = live.filter((v) => v === 'done').length;
  return { answered: live.filter(Boolean).length, done, total: steps.length, complete: done === steps.length };
}

/** An answer as words: "PDH, PWL" for a list, the option itself otherwise. */
export function answerText(a: Answer | undefined): string | null {
  if (a == null) return null;
  return Array.isArray(a) ? (a.length ? a.join(', ') : null) : a;
}

/** The prep in a few lines of Markdown, for the exports. */
export function prepMarkdown(prep: SessionPrep): string {
  const d = prep.data;
  const p = prepProgress(d);
  const out: string[] = [];
  out.push(`- Chart prep: ${p.done} of ${p.total} steps marked${p.answered > p.done ? `, ${p.answered - p.done} skipped` : ''}${prep.started_at ? `, started ${prep.started_at.slice(11, 16)} UTC` : ''}`);
  if (stepsOf(d) === PREP_STEPS) {
    // The new prep reads as its plan (bias, overnight, A, B, C), then the decisions the app checks trades against.
    for (const r of planSummary(d.answers)) out.push(`- ${r.label}: ${r.value}`);
    const a = d.answers;
    const decided = [
      a['draw.side'] && `today I take ${answerText(a['draw.side'])}`, a['draw.direction'] && `price draws ${answerText(a['draw.direction'])}`,
      a['draw.target'] && `target ${answerText(a['draw.target'])}`, a[WAIT_KEY] && `sweep to wait for ${answerText(a[WAIT_KEY])}`,
      a['session.stop'] && `stop after ${answerText(a['session.stop'])}`,
    ].filter(Boolean);
    if (decided.length) out.push(`- Decisions: ${decided.join('; ')}`);
    return out.join('\n');
  }
  for (const step of stepsOf(d)) {
    const said = step.fields
      .map((f) => [f.label, answerText(d.answers[answerKey(step, f)])] as const)
      .filter(([, v]) => v != null)
      .map(([k, v]) => `${k.toLowerCase()} ${v}`);
    const ticked = (d.ticks[step.id] ?? []).length;
    if (!said.length && !ticked) continue;
    const marks = liveMarks(step).length;
    out.push(`- ${step.title}: ${said.join('; ')}${marks ? `${said.length ? ' · ' : ''}${ticked}/${marks} marked` : ''}`);
  }
  return out.join('\n');
}

/* ───────────────────────── the plans ───────────────────────── */

const str = (a: Answer | undefined): string | null => (typeof a === 'string' && a.trim() ? a.trim() : null);
/** A tapped list, or null when nothing is tapped. */
const list = (a: Answer | undefined): string[] | null => (Array.isArray(a) && a.length ? a : null);
/** A scenario's trigger zones: the tapped ones, or the one picked before (an old prep). */
export const zonesOf = (answers: Record<string, Answer>, k: 'a' | 'b'): string[] =>
  list(answers[`plans.${k}Zones`]) ?? (str(answers[`plans.${k}Trigger`]) ? [str(answers[`plans.${k}Trigger`])!] : []);
const DECIDED = ['draw.side', 'draw.direction', 'liquidity.wait', 'draw.target'] as const;

/**
 * The decisions plan match, the plan grade and the stop rule read, from the
 * written plans: the side (both scenarios' directions), the direction (A's),
 * the sweeps to wait for (each scenario's trigger, when it is a named level
 * not already run) and the target (A's). A prep with no plan written keeps
 * whatever it held: a prep saved before is never rewritten.
 */
export function deriveDecisions(answers: Record<string, Answer>): Record<string, Answer> {
  const a = (k: string) => str(answers[`plans.${k}`]);
  const dirs = [a('aDir'), a('bDir')].filter((d): d is string => !!d);
  const triggers = [...zonesOf(answers, 'a'), ...zonesOf(answers, 'b')];
  if (!dirs.length && !triggers.length && !a('aTarget')) return answers;
  const out: Record<string, Answer> = { ...answers };
  for (const k of DECIDED) delete out[k];
  if (dirs.length) out['draw.side'] = new Set(dirs).size > 1 ? 'Both ways' : dirs[0] === 'Long' ? 'Longs only' : 'Shorts only';
  if (a('aDir')) out['draw.direction'] = a('aDir') === 'Long' ? 'Up' : 'Down';
  const taken = Array.isArray(answers[TAKEN_KEY]) ? answers[TAKEN_KEY] as string[] : [];
  const wait = [...new Set(triggers.filter((t) => SWEEPABLE.includes(t) && !taken.includes(t)))];
  if (wait.length) out[WAIT_KEY] = wait;
  if (a('aTarget')) out['draw.target'] = a('aTarget')!;
  return out;
}

export type Bias = 'Bullish' | 'Bearish' | 'Neutral';
export const biasOf = (answers: Record<string, Answer>): Bias | null => (str(answers['htf.bias']) as Bias | null);

/**
 * The highest grade a scenario can reach today: with the bias, A+; against
 * it, B at most; with no bias you can state honestly, only an A+ setup at all.
 */
export function gradeCeiling(answers: Record<string, Answer>, k: 'a' | 'b'): string | null {
  const bias = biasOf(answers); const dir = str(answers[`plans.${k}Dir`]);
  if (!bias) return null;
  if (bias === 'Neutral') return 'A+ only — no bias';
  if (!dir) return null;
  const withBias = (bias === 'Bullish') === (dir === 'Long');
  return withBias ? 'Can reach A+' : 'B max — against the bias';
}

export interface PlanCheck { level: 'warn' | 'note'; text: string }

/**
 * The three rules, checked as you write (notes, never a gate):
 * the scenarios differ in which liquidity is taken first; each can be killed;
 * and A is the one with the bias.
 */
export function planChecks(answers: Record<string, Answer>): PlanCheck[] {
  const a = (k: string) => str(answers[`plans.${k}`]);
  const out: PlanCheck[] = [];
  const tapped = (k: string) => list(answers[`plans.${k}`]) != null;
  const started = (k: 'a' | 'b') => ['Dir', 'Story', 'Trigger', 'TriggerNote', 'Target', 'TargetAt', 'Kill'].some((f) => a(`${k}${f}`))
    || ['Zones', 'Confirms', 'Kills'].some((f) => tapped(`${k}${f}`));
  const shared = zonesOf(answers, 'a').filter((z) => zonesOf(answers, 'b').includes(z));
  if (shared.length) {
    out.push({ level: 'warn', text: `Both scenarios start at ${shared.join(' + ')}. They should differ in which liquidity is taken first — that is the question the open answers.` });
  }
  for (const k of ['a', 'b'] as const) {
    if (started(k) && !a(`${k}Kill`) && !tapped(`${k}Kills`)) out.push({ level: 'warn', text: `Scenario ${k.toUpperCase()} has no kill switch. If it can't be killed, it's a hope, not a plan.` });
  }
  if (a('aDir') && a('aDir') === a('bDir')) out.push({ level: 'note', text: `Both scenarios are ${a('aDir')!.toLowerCase()}s. B is usually the other side's story.` });
  const bias = biasOf(answers);
  if (bias && bias !== 'Neutral' && a('aDir') && (bias === 'Bullish') !== (a('aDir') === 'Long')) {
    out.push({ level: 'note', text: `Scenario A is against your ${bias.toLowerCase()} bias. A is the primary, with the bias; swap them, or say why.` });
  }
  return out;
}

/** "Highs run, lows still there": which side of the overnight book has been taken, and so where the untaken liquidity rests. */
export function overnightRead(answers: Record<string, Answer>): { stillThere: string[]; line: string | null } {
  const taken = Array.isArray(answers[TAKEN_KEY]) ? answers[TAKEN_KEY] as string[] : [];
  const stillThere = OVERNIGHT.filter((l) => !taken.includes(l));
  const highs = taken.filter((l) => HIGHS.has(l)).length; const lows = taken.length - highs;
  const line = !taken.length ? null
    : highs && !lows ? 'Highs run, lows untouched: the resting liquidity is below.'
      : lows && !highs ? 'Lows run, highs untouched: the resting liquidity is above.'
        : 'Both sides have been run: no clean side yet.';
  return { stillThere, line };
}

/** The bias sentence, as written: "4H/1H bias is bullish because … Invalidated by a 1H body close beyond …". */
export function biasSentence(answers: Record<string, Answer>): string | null {
  const bias = biasOf(answers);
  if (!bias) return null;
  if (bias === 'Neutral') return 'Neutral — A+ only today.';
  const because = list(answers['htf.reasons'])?.map((x) => x.charAt(0).toLowerCase() + x.slice(1)).join(', ') ?? str(answers['htf.because']);
  const inv = str(answers['htf.invAt'])?.replace(/^The /, 'the ') ?? str(answers['htf.inv']);
  return `4H/1H bias is ${bias.toLowerCase()}${because ? ` because ${because}` : ''}.${inv ? ` Invalidated by a 1H body close beyond ${inv}.` : ''}`;
}

/** One scenario in a line, for the summary and the dashboard. */
export function scenarioLine(answers: Record<string, Answer>, k: 'a' | 'b'): string | null {
  const a = (f: string) => str(answers[`plans.${k}${f}`]);
  const l = (f: string) => list(answers[`plans.${k}${f}`]);
  const zones = l('Zones')?.join(' + ') ?? a('TriggerNote') ?? a('Trigger');
  const target = a('TargetAt') ?? a('TargetNote') ?? a('Target');
  const kill = l('Kills')?.join(' / ') ?? a('Kill');
  const parts = [
    a('Story') ?? [a('Dir'), zones && `from ${zones}`].filter(Boolean).join(' '),
    target && `→ ${target}`,
    a('RR') && `· ${a('RR')}R`,
    kill && `· killed by ${kill.charAt(0).toLowerCase()}${kill.slice(1)}`,
  ].filter(Boolean);
  return parts.length && parts[0] ? parts.join(' ') : null;
}

export const scenarioC = (answers: Record<string, Answer>) =>
  `Neither trigger zone reached by ${str(answers['plans.cutoffAt']) ?? str(answers['plans.cutoff']) ?? '9:30'}, or price chops through both: no trade.`;

/** The day's plan in a few rows: what the dashboard shows and the prep ends on. */
export function planSummary(answers: Record<string, Answer>): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string | null }> = [
    { label: 'Bias', value: biasSentence(answers) },
    { label: 'News', value: str(answers['session.news']) },
    { label: 'Overnight', value: overnightRead(answers).line },
    { label: 'Location', value: str(answers['location.zone']) },
    { label: 'Scenario A', value: scenarioLine(answers, 'a') },
    { label: 'Scenario B', value: scenarioLine(answers, 'b') },
  ];
  const any = rows.some((r) => r.value);
  if (any) rows.push({ label: 'Scenario C', value: scenarioC(answers) });
  return rows.filter((r): r is { label: string; value: string } => !!r.value);
}
