import { TARGET_TYPES } from './domain';

/**
 * The chart prep: the second half of the morning check-in, done on the chart
 * before the New York session.
 *
 * The TradingView script (Nick iFVG v6) now draws what the prep used to ask
 * for by hand — killzone highs and lows, PDH/PDL, PWH/PWL, equal highs and
 * lows, FVGs from 5m to 4H, the dealing range and its 50%, the HTF bias and
 * its invalidation, alerts on every level. So the prep reads, then decides:
 *
 *   1. Read the panel   the two rows read before an entry: HTF bias + 1H inv
 *                       (and the "A+ only" conflict), and the nearest levels
 *   2. Off the script   what it does not do: the order-book heatmap, Daily
 *                       FVGs, NDOG, and NWOG until the script's one works
 *   3. Plan and rules   the sweep to wait for, the draw, the target, the side,
 *                       the stop — and the day's news, filled in on its own
 *
 * The six steps of the version before are kept as LEGACY_STEPS: preps saved
 * under them still read, show and export, and still count by their own rule.
 *
 * The reminders are the point: the important levels and checks, each one
 * ticked, so nothing gets skipped on a rushed morning. Order blocks, breakers
 * and support/resistance zones are left out — they are not in the model.
 *
 * Nothing is typed. Like the check-in it is a prompt, never a gate: any step
 * can be skipped and nothing in the app waits on it. Times are New York time,
 * the clock the sessions are defined on.
 */

/** One tap-to-answer question on a step. */
export interface PrepField {
  id: string;
  label: string;
  /** one — a single pill; many — any number of pills; pick — a dropdown. */
  kind: 'one' | 'many' | 'pick';
  options: string[];
  /** No longer asked; answers already saved still read (plan match, exports). */
  hidden?: boolean;
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

/** The prep as it is asked now. */
export const PREP_STEPS: PrepStep[] = [
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

/** Every step a saved prep can hold: the live ones, then the legacy ones (not shown, still read). */
const ALL_STEPS: PrepStep[] = [...PREP_STEPS, ...LEGACY_STEPS.filter((l) => !PREP_STEPS.some((p) => p.id === l.id))];
const LEGACY_ONLY = new Set(LEGACY_STEPS.map((l) => l.id).filter((id) => !PREP_STEPS.some((p) => p.id === id)));

export const answerKey = (step: PrepStep, field: PrepField) => field.key ?? `${step.id}.${field.id}`;

/** Every question by its stored key: the live one wins where both ask it. */
const FIELD_BY_KEY = new Map<string, PrepField>();
for (const st of [...LEGACY_STEPS].reverse().concat(PREP_STEPS)) for (const f of st.fields) FIELD_BY_KEY.set(answerKey(st, f), f);

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
    if (field.kind === 'many') {
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
  const live = PREP_STEPS.map((st) => data.steps[st.id]);
  const done = live.filter((v) => v === 'done').length;
  return { answered: live.filter(Boolean).length, done, total: PREP_STEPS.length, complete: done === PREP_STEPS.length };
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
  for (const step of isLegacyPrep(d) ? LEGACY_STEPS : PREP_STEPS) {
    const said = step.fields
      .map((f) => [f.label, answerText(d.answers[answerKey(step, f)])] as const)
      .filter(([, v]) => v != null)
      .map(([k, v]) => `${k.toLowerCase()} ${v}`);
    const ticked = (d.ticks[step.id] ?? []).length;
    if (!said.length && !ticked) continue;
    out.push(`- ${step.title}: ${said.join('; ')}${said.length ? ' · ' : ''}${ticked}/${liveMarks(step).length} marked`);
  }
  return out.join('\n');
}
