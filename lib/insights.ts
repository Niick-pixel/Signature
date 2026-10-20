/**
 * Learning from my own words.
 *
 * Every trade carries an explanation and a lesson, written right after it
 * ended. Read together they say what keeps going wrong far better than any
 * table of win rates: the same complaint ("no clean target", "entered late",
 * "against my bias") turns up again and again, often in lessons that promise
 * it will not happen again.
 *
 * The phrases themselves live in lib/phrases.ts, an editable dictionary.
 *
 * Everything here is local and deterministic — plain pattern matching over
 * the text, the tags and the trade's own fields. No model, no cloud, nothing
 * leaves the machine. Patterns are written for how I actually write (ICT
 * vocabulary, typos and all), and each theme also counts the structured
 * signals that say the same thing (a tag, a field), so a trade is found even
 * when the words differ.
 *
 * Missed trades count as what hesitating cost: a missed winner is R I did not
 * take (negative), a missed loser is R the hesitation saved (positive).
 */
import { isHypothetical, isTaken } from './domain';
import { patternsFor } from './phrases';
import type { Trade } from './types';

/* --------------------------------------------------------------- themes */

export interface ThemeDef {
  id: string;
  /** A short name, in the trader's voice. */
  title: string;
  /** One line on why it matters. */
  why: string;
  /** An if-then rule to try — the thing to do differently. */
  rule: string;
  patterns: RegExp[];
  /** The same mistake, said by a tag or a field rather than in words. */
  signal?: (t: Trade) => boolean;
  /** Conditions (by id or id prefix, see conditions()) that are the evidence for it. */
  evidence?: string[];
}

const tag = (t: Trade, ...names: string[]) => (t.mistake_tags ?? []).some((m) => names.includes(m));
const isLong = (t: Trade) => t.direction === 'Long';

export const THEMES: ThemeDef[] = [
  {
    id: 'target',
    evidence: ['target:', 'target-failed', 'mistake:No defined target'],
    title: 'Weak or unclear targets',
    why: 'A target price is not drawn to has no reason to be reached. The trade goes nowhere, stalls, and comes back.',
    rule: 'If I cannot name a clean, untested pool as the target — a data wick, PDH/PDL, a real EQH/EQL — then I do not take it.',
    patterns: patternsFor('target'),
    signal: (t) => tag(t, 'No defined target') || t.target_check_passed === false,
  },
  {
    id: 'late',
    evidence: ['mistake:Entered late', 'mistake:Chased', "worked:Waited for the close"],
    title: 'Late entries and chasing',
    why: 'The late entry has the worst price and the tightest room. The first entry is the trade; the second is a chase.',
    rule: 'If the first entry is gone, then I wait for the next setup — I never take the second-best entry.',
    patterns: patternsFor('late'),
    signal: (t) => tag(t, 'Entered late', 'Chased'),
  },
  {
    id: 'early',
    evidence: ['mistake:No trigger', 'mistake:Took it before the sweep', "mistake:Didn't wait for the close", 'worked:Waited for the sweep', 'worked:Waited for the close'],
    title: 'Entering before confirmation',
    why: 'An entry before the sweep or before the inversion closes is a guess that the setup will form.',
    rule: 'If the sweep and the inversion close have not both happened, then there is no trade yet.',
    patterns: patternsFor('early'),
    signal: (t) => tag(t, 'Took it before the sweep', "Didn't wait for the close", 'No trigger'),
  },
  {
    id: 'bias',
    evidence: ['against-bias', 'with-bias'],
    title: 'Trading against the HTF bias',
    why: 'Against the bias, the setup fights the move that pays everyone else.',
    rule: 'If it is against the HTF bias, then it is a pass — logged as Passed, not taken.',
    patterns: patternsFor('bias'),
    signal: (t) => t.htf_bias === 'Against bias' || tag(t, 'Against HTF bias'),
  },
  {
    id: 'pd',
    evidence: ['pd-right', 'pd-wrong', 'equilibrium'],
    title: 'Wrong side of the range',
    why: 'Longs belong in discount and shorts in premium. From the middle, the R is thin and the stop is close to nothing.',
    rule: 'If a long is not in discount (or a short in premium), then I wait for price to come to me.',
    patterns: patternsFor('pd'),
    signal: (t) => (isLong(t) && t.premium_discount === 'Premium') || (!isLong(t) && t.premium_discount === 'Discount')
      || tag(t, 'Long in premium', 'Short in discount'),
  },
  {
    id: 'sweep',
    evidence: ['no-sweep', 'major-sweep', 'worked:Waited for the sweep'],
    title: 'No sweep, no fuel',
    why: 'The sweep is the fuel. Without liquidity taken first, the inversion has nothing behind it.',
    rule: 'If no named level was swept first, then the move has no fuel — no trade.',
    patterns: patternsFor('sweep'),
    signal: (t) => isTaken(t.outcome) && t.sweep_tier === 'none',
  },
  {
    id: 'fear',
    evidence: ['low-conf', 'high-conf'],
    title: 'Fear, doubt and hesitation',
    why: 'A trade taken unsure is usually managed badly, and a setup skipped out of fear is R left on the table.',
    rule: 'If I am unsure, then I log it as Passed and check afterwards — doubt is a no-trade by my rules, not a reason to half-take it.',
    patterns: patternsFor('fear'),
    signal: (t) => t.confidence_at_entry != null && t.confidence_at_entry <= 2,
  },
  {
    id: 'momentum',
    title: 'Slow price after entry',
    why: 'If it does not go quickly, it usually does not go. Slow price after the entry is the trade telling you something.',
    rule: 'If it takes more than 4 candles to go through the 1m FVG, then I move to breakeven or get out.',
    patterns: patternsFor('momentum'),
  },
  {
    id: 'stop',
    title: 'Stop placement',
    why: 'A stop inside the level price is likely to revisit gets taken by the retest, even when the idea was right.',
    rule: 'If my stop sits inside the HTF FVG, then I move it past the level where the idea completely fails.',
    patterns: patternsFor('stop'),
  },
  {
    id: 'breakeven',
    evidence: ['mistake:Moved stop', 'worked:Let the winner run', 'worked:Managed to plan'],
    title: 'Breakeven too early, stop moved',
    why: 'Moving the stop before the plan says turns small winners into scratches and lets the noise decide.',
    rule: 'If price has not reached my breakeven trigger, then the stop stays exactly where I put it.',
    patterns: patternsFor('breakeven'),
    signal: (t) => tag(t, 'Moved stop'),
  },
  {
    id: 'prep',
    title: 'Skipped chart prep',
    why: 'A level not marked before the open is a level found in the heat of the trade — usually too late, or wrongly.',
    rule: 'If the HTF FVGs, the fib range and the levels are not marked before the open, then I do not trade until they are.',
    patterns: patternsFor('prep'),
  },
  {
    id: 'overtrading',
    evidence: ['mistake:Revenge', 'mistake:Overtraded'],
    title: 'One more trade, the same day',
    why: 'The trade after a loss is the most expensive one in the journal. Tilt rarely feels like tilt.',
    rule: 'If I have taken 2 losses today, then I am done for the day.',
    patterns: patternsFor('overtrading'),
    signal: (t) => tag(t, 'Revenge', 'Overtraded'),
  },
];

/* ------------------------------------------------------------ reading */

export interface Quote {
  tradeId: string;
  date: string;
  outcome: string;
  r: number | null;
  missed: boolean;
  text: string;
  from: 'lesson' | 'explanation';
}

/** Sentences, roughly: a journal is written fast, so commas count when a "sentence" runs on. */
export function sentences(text: string, splitLong = true): string[] {
  return text
    .replace(/[ \t]+/g, ' ')
    .split(/(?<=[.!?])\s+|\n+/)
    .flatMap((s) => (splitLong && s.length > 220 ? s.split(/,\s+(?=\w)/) : [s]))
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const clip = (s: string, max = 170) => (s.length <= max ? s : `${s.slice(0, max - 1).replace(/\s+\S*$/, '')}…`);

/**
 * A long sentence cut down to the part that matched: the comma-separated
 * pieces around the match, widened while it stays short enough to read.
 */
export function around(sentence: string, pattern: RegExp, max = 170): string {
  if (sentence.length <= max) return sentence;
  const parts = sentence.split(/(?<=,)\s+/);
  const hit = parts.findIndex((p) => pattern.test(p));
  if (hit === -1) return clip(sentence, max);
  let lo = hit; let hi = hit;
  const len = () => parts.slice(lo, hi + 1).join(' ').length;
  while (true) {
    const grewHi = hi + 1 < parts.length && len() + parts[hi + 1].length + 1 <= max;
    if (grewHi) hi += 1;
    const grewLo = lo > 0 && len() + parts[lo - 1].length + 1 <= max;
    if (grewLo) lo -= 1;
    if (!grewHi && !grewLo) break;
  }
  const text = parts.slice(lo, hi + 1).join(' ').replace(/,$/, '');
  return `${lo > 0 ? '…' : ''}${clip(text, max)}${hi < parts.length - 1 && !text.endsWith('…') ? '…' : ''}`;
}

/** The trade's contribution: its R, or for a Missed trade what hesitating cost (−R). */
export function effectiveR(t: Trade): number {
  const r = t.r_multiple ?? 0;
  return isHypothetical(t.account) ? -r : r;
}

/** Trades with something to learn from: taken (or missed) with an outcome, not a plan. */
export function readable(trades: readonly Trade[]): Trade[] {
  return trades.filter((t) => !t.deleted_at && t.status !== 'Planned' && isTaken(t.outcome))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/*
  Sample-size guard. Under EARLY_N trades a pattern is an "early signal",
  shown but never ranked; and no pattern is named the #1 leak until there
  are LEAK_MIN_TRADES trades in view — a leak named from eight trades is a
  coin flip with a headline.
*/
export const EARLY_N = 5;
export const LEAK_MIN_TRADES = 20;

/** Where a theme is said in a trade's own words: the matching sentences. */
function matches(def: ThemeDef, t: Trade): Array<{ text: string; from: 'lesson' | 'explanation' }> {
  const out: Array<{ text: string; from: 'lesson' | 'explanation' }> = [];
  for (const [from, body] of [['lesson', t.lesson ?? ''], ['explanation', t.explanation ?? '']] as const) {
    for (const s of sentences(body, false)) {
      const p = def.patterns.find((x) => x.test(s));
      if (p) out.push({ text: around(s, p), from });
    }
  }
  return out;
}

/**
 * The themes on one trade: said in its lesson (part 'lesson'), or anywhere —
 * the explanation, the lesson, or a tag/field that says the same (part 'any').
 */
export function themesOf(t: Trade, part: 'lesson' | 'any' = 'any'): string[] {
  return THEMES.filter((d) => {
    const said = matches(d, t);
    return part === 'lesson' ? said.some((s) => s.from === 'lesson') : said.length > 0 || Boolean(d.signal?.(t));
  }).map((d) => d.id);
}

/* ------------------------------------------------------------ results */

export interface ThemeResult {
  id: string;
  title: string;
  why: string;
  rule: string;
  /** Trades the theme was found on — by words or by a tag/field. */
  n: number;
  /** Of them, found in the words (the rest only by a tag or a field). */
  inWords: number;
  wins: number;
  losses: number;
  breakeven: number;
  missed: number;
  /** Sum of effective R: what trades with this theme did to the result. */
  netR: number;
  /** Average R of the taken trades with it, and of those without. */
  avgR: number | null;
  othersAvgR: number | null;
  /** What the trades' own fields say about it: the related conditions, with and without. */
  evidence: Condition[];
  /** Lessons that name it, the first one's date, and what happened after. */
  lessons: number;
  firstLesson: string | null;
  afterFirstLesson: { n: number; netR: number };
  /** In the last 10 trades read. */
  recent: number;
  /** Per week, oldest first: trades with it / trades read. Last 6 weeks with trades. */
  weekly: Array<{ week: string; n: number; of: number }>;
  quotes: Quote[];
}

export interface Phrase { text: string; losers: number; winners: number }

export interface Condition {
  id: string;
  label: string;
  n: number;
  wins: number;
  losses: number;
  avgR: number;
  othersAvgR: number;
  delta: number;
  netR: number;
}

export interface Insights {
  /** Trades read (taken or missed, with an outcome). */
  read: number;
  /** Of them, with any writing to read. */
  written: number;
  themes: ThemeResult[];
  /** The one thing to work on. */
  focus: ThemeResult | null;
  /** Words that show up in losing trades far more than in winners — and the reverse. */
  loserPhrases: Phrase[];
  winnerPhrases: Phrase[];
  /** Conditions from the trade's own fields and tags, by what they did to the average R. */
  costly: Condition[];
  paying: Condition[];
  /** The winners, in their own words. */
  winnerQuotes: Quote[];
}

const round = (v: number, dp = 2) => Math.round(v * 10 ** dp) / 10 ** dp;
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null);

/** The Monday of a trade's week. */
function weekOf(date: string): string {
  const d = new Date(`${date.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function quoteOf(t: Trade, text: string, from: 'lesson' | 'explanation'): Quote {
  return { tradeId: t.id, date: t.date.slice(0, 10), outcome: t.outcome, r: t.r_multiple, missed: isHypothetical(t.account), text: clip(text, 190), from };
}

export function analyseTheme(def: ThemeDef, trades: readonly Trade[], all: Condition[] = allConditions(trades)): ThemeResult {
  const read = readable(trades);
  const hits: Array<{ t: Trade; said: ReturnType<typeof matches> }> = [];
  for (const t of read) {
    const said = matches(def, t);
    if (said.length || def.signal?.(t)) hits.push({ t, said });
  }
  const ids = new Set(hits.map((h) => h.t.id));
  const takenR = (ts: Trade[]) => ts.filter((t) => !isHypothetical(t.account) && t.r_multiple != null).map((t) => t.r_multiple as number);
  const withIt = hits.map((h) => h.t);
  const without = read.filter((t) => !ids.has(t.id));

  const lessonHits = hits.filter((h) => h.said.some((s) => s.from === 'lesson'));
  const firstLesson = lessonHits[0]?.t.date ?? null;
  const after = firstLesson ? withIt.filter((t) => t.date > firstLesson) : [];

  // Quotes: lessons first (the thinking), losers before winners, the newest first.
  const quotes = hits
    .flatMap((h) => h.said.map((s) => ({ h, s })))
    .sort((a, b) => (a.s.from === b.s.from ? 0 : a.s.from === 'lesson' ? -1 : 1)
      || (effectiveR(a.h.t) - effectiveR(b.h.t))
      || b.h.t.date.localeCompare(a.h.t.date))
    .filter((x, i, all) => all.findIndex((y) => y.h.t.id === x.h.t.id) === i)
    .slice(0, 8)
    .map(({ h, s }) => quoteOf(h.t, s.text, s.from));

  const weeks = [...new Set(read.map((t) => weekOf(t.date)))].sort().slice(-6);
  const avg = mean(takenR(withIt));
  const others = mean(takenR(without));
  return {
    id: def.id, title: def.title, why: def.why, rule: def.rule,
    n: hits.length,
    inWords: hits.filter((h) => h.said.length).length,
    wins: withIt.filter((t) => t.outcome === 'Win').length,
    losses: withIt.filter((t) => t.outcome === 'Loss').length,
    breakeven: withIt.filter((t) => t.outcome === 'Breakeven' || t.outcome === 'Scratched').length,
    missed: withIt.filter((t) => isHypothetical(t.account)).length,
    netR: round(withIt.reduce((s, t) => s + effectiveR(t), 0)),
    avgR: avg == null ? null : round(avg),
    othersAvgR: others == null ? null : round(others),
    evidence: (def.evidence ?? [])
      .flatMap((e) => all.filter((c) => (e.endsWith(':') ? c.id.startsWith(e) : c.id === e)))
      .filter((c, i, xs) => xs.findIndex((x) => x.id === c.id) === i)
      .sort((a, b) => a.avgR - b.avgR),
    lessons: lessonHits.length,
    firstLesson: firstLesson?.slice(0, 10) ?? null,
    afterFirstLesson: { n: after.length, netR: round(after.reduce((s, t) => s + effectiveR(t), 0)) },
    recent: read.slice(-10).filter((t) => ids.has(t.id)).length,
    weekly: weeks.map((w) => ({ week: w, of: read.filter((t) => weekOf(t.date) === w).length, n: withIt.filter((t) => weekOf(t.date) === w).length })),
    quotes,
  };
}

/* -------------------------------------------------------------- words */

const STOP = new Set(`a about above after again all also am an and any are as at be because been before being below between both but by can
could did do does doing down during each even ever every few for from further had has have having he her here hers him his how i if in into
is it its itself just like me more most my myself no nor not now of off on once only or other our out over own same she should so some still
such than that the their them then there these they this those through to too under until up very was we were what when where which while who
why will with would you your yours i'm i'd i'll it's its didn't don't doesn't wasn't wouldn't couldn't shouldn't can't won't isn't got get
gonna gotta was were way really much many thing things one ones bit lot lots maybe also something anything let made make makes making take
takes taking took went go goes going come came comes back still yet already well since though tough even quite`.split(/\s+/));

/** Words too generic in a trading journal to say anything on their own. */
const BLAND = new Set(`trade trades trading price market markets setup setups entry entered enter time times day today point points session
level levels perfect clean good great better best bad first second last next new previous right left long short longs shorts`.split(/\s+/));

function tokens(text: string): string[] {
  return (text.toLowerCase().replace(/[’`]/g, "'").match(/[a-z0-9][a-z0-9'+/]*/g) ?? []).map((w) => w.replace(/'s$/, ''));
}

/** Every phrase of 1–3 words in a text, once each (document frequency). */
export function phrases(text: string): Set<string> {
  const ws = tokens(text);
  const out = new Set<string>();
  for (let n = 1; n <= 3; n++) {
    for (let i = 0; i + n <= ws.length; i++) {
      const g = ws.slice(i, i + n);
      if (STOP.has(g[0]) || STOP.has(g[n - 1])) continue;
      if (n === 1 && (g[0].length < 4 || BLAND.has(g[0]) || /^\d/.test(g[0]))) continue;
      if (/^\d+$/.test(g[0])) continue;
      if (n > 1 && g.every((w) => STOP.has(w) || BLAND.has(w))) continue;
      out.add(g.join(' '));
    }
  }
  return out;
}

/**
 * The phrases that set losing trades apart from winning ones (and the
 * reverse): how often each appears in each group's writing, compared as
 * shares so a bigger group does not win by size. A shorter phrase that only
 * ever appears inside a longer one is dropped for the longer one.
 */
export function distinctivePhrases(trades: readonly Trade[], limit = 8): { losers: Phrase[]; winners: Phrase[] } {
  const read = readable(trades).filter((t) => !isHypothetical(t.account));
  const text = (t: Trade) => `${t.explanation ?? ''}\n${t.lesson ?? ''}`;
  const L = read.filter((t) => t.outcome === 'Loss').map((t) => phrases(text(t)));
  const W = read.filter((t) => t.outcome === 'Win').map((t) => phrases(text(t)));
  if (!L.length || !W.length) return { losers: [], winners: [] };
  const count = new Map<string, { l: number; w: number }>();
  for (const set of L) for (const p of set) count.set(p, { ...(count.get(p) ?? { l: 0, w: 0 }), l: (count.get(p)?.l ?? 0) + 1 });
  for (const set of W) for (const p of set) count.set(p, { ...(count.get(p) ?? { l: 0, w: 0 }), w: (count.get(p)?.w ?? 0) + 1 });

  const pick = (side: 'l' | 'w') => {
    const mine = side === 'l' ? L.length : W.length;
    const theirs = side === 'l' ? W.length : L.length;
    const min = mine >= 12 ? 3 : 2;
    const scored = [...count]
      .map(([p, c]) => {
        const a = side === 'l' ? c.l : c.w;
        const b = side === 'l' ? c.w : c.l;
        return { p, a, b, score: a / mine - b / theirs };
      })
      .filter((x) => x.a >= min && x.score > 0)
      // Longer phrases first on ties: "no clean target" says more than "target".
      .sort((x, y) => y.score - x.score || y.p.split(' ').length - x.p.split(' ').length || y.a - x.a);
    const kept: typeof scored = [];
    for (const x of scored) {
      // Drop a phrase contained in (or containing) one already kept with the same count.
      if (kept.some((k) => (k.p.includes(x.p) || x.p.includes(k.p)) && Math.abs(k.a - x.a) <= 1)) continue;
      kept.push(x);
      if (kept.length >= limit) break;
    }
    return kept.map((x) => ({ text: x.p, losers: side === 'l' ? x.a : x.b, winners: side === 'l' ? x.b : x.a }));
  };
  return { losers: pick('l'), winners: pick('w') };
}

/* --------------------------------------------------------- conditions */

interface ConditionDef { id: string; label: string; test: (t: Trade) => boolean }

const FIELD_CONDITIONS: ConditionDef[] = [
  { id: 'against-bias', label: 'Against the HTF bias', test: (t) => t.htf_bias === 'Against bias' || tag(t, 'Against HTF bias') },
  { id: 'with-bias', label: 'With the HTF bias', test: (t) => t.htf_bias === 'With bias' && !tag(t, 'Against HTF bias') },
  { id: 'pd-right', label: 'Long in discount / short in premium', test: (t) => (isLong(t) ? t.premium_discount === 'Discount' : t.premium_discount === 'Premium') },
  { id: 'pd-wrong', label: 'Long in premium / short in discount', test: (t) => (isLong(t) ? t.premium_discount === 'Premium' : t.premium_discount === 'Discount') },
  { id: 'equilibrium', label: 'Entered in equilibrium', test: (t) => t.premium_discount === 'Equilibrium' },
  { id: 'no-sweep', label: 'No named sweep first', test: (t) => t.sweep_tier === 'none' || tag(t, 'Took it before the sweep') },
  { id: 'major-sweep', label: 'A major level swept first', test: (t) => t.sweep_tier === 'major' },
  { id: 'low-conf', label: 'Confidence 2★ or less', test: (t) => t.confidence_at_entry != null && t.confidence_at_entry <= 2 },
  { id: 'high-conf', label: 'Confidence 4★ or more', test: (t) => t.confidence_at_entry != null && t.confidence_at_entry >= 4 },
  { id: 'target-failed', label: 'Target check failed', test: (t) => t.target_check_passed === false },
  { id: 'broke-rules', label: 'Said I broke a rule', test: (t) => t.followed_rules === false },
  { id: 'followed-rules', label: 'Said I followed every rule', test: (t) => t.followed_rules === true },
];

/**
 * What each condition does to the average R: trades with it against trades
 * without it, on taken trades with an R. Target types and every tag join the
 * fixed list automatically. Only conditions with two or more trades on each
 * side can say anything; the gap must be at least 0.2R to be listed.
 */
export function allConditions(trades: readonly Trade[]): Condition[] {
  const taken = readable(trades).filter((t) => !isHypothetical(t.account) && t.r_multiple != null);
  const defs: ConditionDef[] = [...FIELD_CONDITIONS];
  for (const tt of new Set(taken.map((t) => t.target_type))) defs.push({ id: `target:${tt}`, label: `Target: ${tt}`, test: (t) => t.target_type === tt });
  for (const m of new Set(taken.flatMap((t) => t.mistake_tags ?? []))) defs.push({ id: `mistake:${m}`, label: `Tagged “${m}”`, test: (t) => (t.mistake_tags ?? []).includes(m) });
  for (const w of new Set(taken.flatMap((t) => t.worked_tags ?? []))) defs.push({ id: `worked:${w}`, label: `“${w}”`, test: (t) => (t.worked_tags ?? []).includes(w) });

  const out: Condition[] = [];
  for (const d of defs) {
    const yes = taken.filter(d.test);
    const no = taken.filter((t) => !d.test(t));
    if (yes.length < 2 || no.length < 2) continue;
    const avg = mean(yes.map((t) => t.r_multiple as number))!;
    const others = mean(no.map((t) => t.r_multiple as number))!;
    out.push({
      id: d.id, label: d.label, n: yes.length,
      wins: yes.filter((t) => t.outcome === 'Win').length, losses: yes.filter((t) => t.outcome === 'Loss').length,
      avgR: round(avg), othersAvgR: round(others), delta: round(avg - others),
      netR: round(yes.reduce((s, t) => s + (t.r_multiple as number), 0)),
    });
  }
  return out;
}

/** The conditions that cost the most and pay the most. A mistake tag is never listed as paying. */
export function conditions(trades: readonly Trade[], all: Condition[] = allConditions(trades)): { costly: Condition[]; paying: Condition[] } {
  return {
    costly: all.filter((c) => c.delta <= -0.2).sort((a, b) => a.delta - b.delta || b.n - a.n).slice(0, 8),
    paying: all.filter((c) => c.delta >= 0.2 && !c.id.startsWith('mistake:')).sort((a, b) => b.delta - a.delta || b.n - a.n).slice(0, 8),
  };
}

const POSITIVE = /\b(clean|best|better|works?|worked|easy|easiest|key|important|always|patient|wait(ed)?|perfect|strong|powerful|improving|good draw|draws?)\b/gi;

/** The sentence of a winning lesson most worth keeping, and how much of what went right it names. */
function keeper(lesson: string): { text: string; score: number } {
  const ss = sentences(lesson, false).filter((x) => x.length >= 25);
  const best = [...ss].sort((a, b) => (b.match(POSITIVE)?.length ?? 0) - (a.match(POSITIVE)?.length ?? 0))[0]
    ?? sentences(lesson)[0] ?? '';
  return { text: best, score: best.match(POSITIVE)?.length ?? 0 };
}

/* --------------------------------------------------------------- all */

export function analyse(trades: readonly Trade[]): Insights {
  const read = readable(trades);
  const all = allConditions(read);
  const themes = THEMES.map((d) => analyseTheme(d, read, all))
    .filter((t) => t.n > 0)
    // Most costly first; ties by how often it happens.
    .sort((a, b) => a.netR - b.netR || b.n - a.n);
  /*
    The focus: the costliest theme that is more than a one-off, preferring
    one I have already written a lesson about and that is still happening —
    a lesson written and not followed is the cheapest thing to fix.
  */
  const candidates = read.length < LEAK_MIN_TRADES ? [] : themes.filter((t) => t.netR < 0 && t.n >= EARLY_N);
  const focus = candidates.find((t) => t.lessons > 0 && t.recent > 0) ?? candidates[0] ?? null;
  /*
    One trade's sentence is quoted once on the page: the focus picks first,
    then each theme in order takes the quotes nobody has used yet (falling
    back to a used one only when it has nothing else).
  */
  const used = new Set<string>();
  for (const t of focus ? [focus, ...themes.filter((x) => x !== focus)] : themes) {
    const want = t === focus ? 3 : 2;
    const fresh = t.quotes.filter((q) => !used.has(q.tradeId));
    t.quotes = (fresh.length ? fresh : t.quotes).slice(0, want);
    for (const q of t.quotes) used.add(q.tradeId);
  }
  const words = distinctivePhrases(read);
  const cond = conditions(read, all);
  // The winners' lessons that name what went right most clearly, then the biggest.
  const winnerQuotes = read
    .filter((t) => t.outcome === 'Win' && !isHypothetical(t.account) && (t.lesson ?? '').trim())
    .map((t) => ({ t, k: keeper(t.lesson ?? '') }))
    .sort((a, b) => b.k.score - a.k.score || (b.t.r_multiple ?? 0) - (a.t.r_multiple ?? 0))
    .slice(0, 3)
    .map(({ t, k }) => quoteOf(t, k.text, 'lesson'));
  return {
    read: read.length,
    written: read.filter((t) => (t.explanation ?? '').trim() || (t.lesson ?? '').trim()).length,
    themes, focus,
    loserPhrases: words.losers, winnerPhrases: words.winners,
    costly: cond.costly, paying: cond.paying,
    winnerQuotes,
  };
}
