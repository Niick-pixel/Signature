import { TARGET_TYPES } from './domain';

/**
 * The chart prep: the second half of the morning check-in, done on the chart
 * before the New York session.
 *
 * Six steps, each a set of reminders to tick as they go on the chart and a
 * few answers to tap — every one of them something the model uses (plus the
 * order-book heatmap, kept on purpose):
 *
 *   1. Bias            the HTF swing range, its 50%, the nearest HTF FVGs
 *   2. Liquidity       every nameable level a sweep can take
 *   3. HTF gaps        FVGs in the direction of travel, 5m up to 4H, and the opening gaps
 *   4. Heatmap         the resting size in the book
 *   5. Draw and plan   which way, to which target class, where it is wrong
 *   6. Session         news, the killzone, the rules for today
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
}

export interface PrepStep {
  id: string;
  title: string;
  /** The timeframes to look at for this step. */
  frames?: string;
  /** What to draw, one line per mark — each ticked as it goes on the chart. */
  marks: string[];
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
export const PREP_STEPS: PrepStep[] = [
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
    id: 'session', title: 'Session and rules', frames: 'NY AM',
    marks: [
      'Red-folder release times lined',
      'NY AM killzone shaded',
      'Only the model: a named sweep, one clean FVG, an inversion close',
      'Daily loss limit set in the platform',
      'Step away until an alert rings',
    ],
    fields: [
      { id: 'news', label: 'News', kind: 'one', options: ['None today', 'Before the open', 'Inside the killzone'] },
      { id: 'first', label: 'First entry', kind: 'pick', options: ['From the open (9:30)', 'After 9:45', 'After 10:00', '15 min after the news'] },
      { id: 'done', label: 'Done by', kind: 'pick', options: ['11:00', '11:30', '12:00', 'The close'] },
      { id: 'stop', label: 'Stop after', kind: 'one', options: ['1 loss', '2 losses', 'Daily limit'] },
    ],
  },
];

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
    if (PREP_STEP_IDS.includes(id) && (v === 'done' || v === 'skipped')) steps[id] = v;
  }
  const ticks: Record<string, number[]> = {};
  for (const [id, v] of Object.entries(obj(r.ticks))) {
    const step = PREP_STEPS.find((s) => s.id === id);
    if (!step || !Array.isArray(v)) continue;
    ticks[id] = [...new Set(v.filter((i): i is number => Number.isInteger(i) && i >= 0 && i < step.marks.length))].sort();
  }
  const answers: Record<string, Answer> = {};
  for (const [key, v] of Object.entries(obj(r.answers))) {
    const [stepId, fieldId] = key.split('.');
    const field = PREP_STEPS.find((s) => s.id === stepId)?.fields.find((f) => f.id === fieldId);
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

/** How far through: steps done or skipped, out of all of them. */
export function prepProgress(data: PrepData): { answered: number; done: number; total: number } {
  const states = Object.values(data.steps);
  return { answered: states.length, done: states.filter((s) => s === 'done').length, total: PREP_STEPS.length };
}

export const answerKey = (step: PrepStep, field: PrepField) => `${step.id}.${field.id}`;

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
  for (const step of PREP_STEPS) {
    const said = step.fields
      .map((f) => [f.label, answerText(d.answers[answerKey(step, f)])] as const)
      .filter(([, v]) => v != null)
      .map(([k, v]) => `${k.toLowerCase()} ${v}`);
    const ticked = (d.ticks[step.id] ?? []).length;
    if (!said.length && !ticked) continue;
    out.push(`- ${step.title}: ${said.join('; ')}${said.length ? ' · ' : ''}${ticked}/${step.marks.length} marked`);
  }
  return out.join('\n');
}
