/**
 * The analytics tabs and "Ask your journal". Pure: the page hands in the
 * trades (one world at a time, missed and planned out) and the news, and
 * gets back numbers and sentences. Nothing here calls a model or the
 * network — every answer is counting, and says how many trades it counts.
 */
import { CHECKLIST_PHASES, CONTEXT_FLAG_LIST, SWEEP_TIER_SPEC, isHypothetical, isTaken } from './domain';
import { THEMES, sentences, themesOf } from './insights';
import { nyMinutes } from './planMatch';
import { wallToUtc } from './traderZone';
import type { Trade } from './types';
import type { StoredNews } from './news';

const round = (v: number, dp = 2) => Math.round(v * 10 ** dp) / 10 ** dp;
const R = (t: Trade) => t.r_multiple ?? 0;

/** The trades analytics reads: taken, settled, with an R, not missed, not deleted. */
export function analysable(trades: readonly Trade[]): Trade[] {
  return trades.filter((t) => !t.deleted_at && t.status !== 'Planned' && isTaken(t.outcome) && !isHypothetical(t.account) && t.r_multiple != null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface Stat { n: number; wins: number; losses: number; winRate: number | null; avgR: number | null; netR: number }

export function statOf(ts: readonly Trade[]): Stat {
  const wins = ts.filter((t) => t.outcome === 'Win').length;
  const losses = ts.filter((t) => t.outcome === 'Loss').length;
  const net = round(ts.reduce((s, t) => s + R(t), 0));
  return { n: ts.length, wins, losses, winRate: wins + losses ? round(wins / (wins + losses), 3) : null, avgR: ts.length ? round(net / ts.length) : null, netR: net };
}

/* ───────────────────────── clocks ───────────────────────── */

export type Clock = 'ny' | 'local';
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Minutes past midnight and the weekday (0 = Monday) a trade was taken, on the chosen clock. */
export function clockOf(t: Pick<Trade, 'date'>, clock: Clock): { mins: number; weekday: number } {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(t.date);
  if (!m) return { mins: 0, weekday: 0 };
  if (clock === 'local') {
    return { mins: +m[2] * 60 + +m[3], weekday: (new Date(`${m[1]}T12:00:00Z`).getUTCDay() + 6) % 7 };
  }
  const mins = nyMinutes(t.date) ?? 0;
  // New York's date: the local wall clock moved into UTC, then into New York.
  const utc = wallToUtc(`${m[1]}T${m[2]}:${m[3]}`);
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(utc));
  return { mins, weekday: (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7 };
}

export const hhmm = (mins: number) => `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

/* ───────────────────────── time ───────────────────────── */

export interface Bucket extends Stat { from: number }

/** The trading sessions, in New York minutes. */
export const SESSION_RANGES: Array<{ id: string; label: string; from: number; to: number }> = [
  { id: 'asia', label: 'Asia', from: 20 * 60, to: 24 * 60 },
  { id: 'london', label: 'London', from: 2 * 60, to: 5 * 60 },
  { id: 'nyam', label: 'NY AM', from: 9 * 60 + 30, to: 11 * 60 },
  { id: 'lunch', label: 'NY lunch', from: 11 * 60 + 30, to: 13 * 60 + 30 },
  { id: 'nypm', label: 'NY PM', from: 13 * 60 + 30, to: 16 * 60 },
];

export interface TimeView {
  buckets: Bucket[];
  best: Bucket | null;
  worst: Bucket | null;
  sessions: Array<{ id: string; label: string; from: number; to: number } & Stat>;
  heat: { rows: Array<{ weekday: number; label: string; cells: Array<{ hour: number } & Stat> }>; hours: number[] };
  weekdays: Array<{ label: string } & Stat>;
}

export function timeView(ts: readonly Trade[], clock: Clock, minN: number): TimeView {
  const at = ts.map((t) => ({ t, ...clockOf(t, clock), ny: clockOf(t, 'ny').mins }));
  const buckets: Bucket[] = Array.from({ length: 48 }, (_, i) => ({ from: i * 30, ...statOf(at.filter((x) => Math.floor(x.mins / 30) === i).map((x) => x.t)) }));
  const ranked = buckets.filter((b) => b.n >= minN && b.avgR != null);
  const best = ranked.length ? ranked.reduce((a, b) => (b.avgR! > a.avgR! ? b : a)) : null;
  const worst = ranked.length > 1 ? ranked.reduce((a, b) => (b.avgR! < a.avgR! ? b : a)) : null;
  const sessions = SESSION_RANGES.map((s) => ({ ...s, ...statOf(at.filter((x) => x.ny >= s.from && x.ny < s.to).map((x) => x.t)) }));
  const used = at.map((x) => Math.floor(x.mins / 60));
  const lo = used.length ? Math.max(0, Math.min(...used) - 1) : 6;
  const hi = used.length ? Math.min(23, Math.max(...used) + 1) : 12;
  const hours = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  const days = [0, 1, 2, 3, 4, ...[5, 6].filter((d) => at.some((x) => x.weekday === d))];
  const rows = days.map((d) => ({
    weekday: d, label: WEEKDAYS[d],
    cells: hours.map((h) => ({ hour: h, ...statOf(at.filter((x) => x.weekday === d && Math.floor(x.mins / 60) === h).map((x) => x.t)) })),
  }));
  const weekdays = days.map((d) => ({ label: WEEKDAYS[d], ...statOf(at.filter((x) => x.weekday === d).map((x) => x.t)) }));
  return { buckets, best, worst: worst && worst !== best ? worst : null, sessions, heat: { rows, hours }, weekdays };
}

/* ───────────────────────── confluences ───────────────────────── */

export interface ConfluenceRow extends Stat { id: string; group: string; label: string; delta: number | null; early: boolean }

interface Def { id: string; group: string; label: string; test: (t: Trade) => boolean | null }

function confluenceDefs(ts: readonly Trade[]): Def[] {
  const defs: Def[] = [];
  for (const phase of CHECKLIST_PHASES) for (const item of phase.items) {
    if (item.kind === 'tier') {
      for (const tier of ['major', 'minor', 'none'] as const) defs.push({ id: `sweep:${tier}`, group: 'Checklist', label: `Sweep: ${SWEEP_TIER_SPEC[tier].label.toLowerCase()}`, test: (t) => (t.sweep_tier == null ? null : t.sweep_tier === tier) });
    } else {
      const key = item.key as keyof Trade;
      defs.push({ id: `chk:${item.key}`, group: 'Checklist', label: item.label, test: (t) => { const v = t[key]; return v == null ? null : v === true; } });
    }
  }
  for (const f of CONTEXT_FLAG_LIST) defs.push({ id: `flag:${f.key}`, group: 'Confluences', label: f.label, test: (t) => (t as unknown as Record<string, unknown>)[f.key] === true });
  const values = <K extends keyof Trade>(k: K) => [...new Set(ts.map((t) => t[k]).filter((v): v is NonNullable<Trade[K]> => v != null && v !== ''))] as string[];
  const each = (group: string, k: keyof Trade, prefix = '') => {
    for (const v of values(k)) defs.push({ id: `${String(k)}:${v}`, group, label: `${prefix}${v}`, test: (t) => t[k] === v });
  };
  each('Setup', 'setup_type'); each('Session', 'session'); each('Target', 'target_type'); each('Context', 'htf_bias');
  each('Context', 'premium_discount'); each('Management', 'management'); each('Direction', 'direction');
  for (const [group, key] of [['What worked', 'worked_tags'], ['Mistakes', 'mistake_tags'], ['Market', 'market_tags']] as const) {
    for (const v of new Set(ts.flatMap((t) => (t[key] as string[] | undefined) ?? []))) defs.push({ id: `${key}:${v}`, group, label: v, test: (t) => ((t[key] as string[] | undefined) ?? []).includes(v) });
  }
  return defs;
}

/** Win rate and average R per checklist box, confluence, setup, session, target and tag — each against trades without it. */
export function confluences(ts: readonly Trade[], minN: number): ConfluenceRow[] {
  const out: ConfluenceRow[] = [];
  for (const d of confluenceDefs(ts)) {
    const yes = ts.filter((t) => d.test(t) === true);
    const no = ts.filter((t) => d.test(t) === false);
    if (!yes.length) continue;
    const s = statOf(yes); const o = statOf(no);
    // An edge needs enough trades on both sides: 29 with it against 1 without says nothing about it.
    out.push({ id: d.id, group: d.group, label: d.label, ...s, delta: o.n >= minN && s.avgR != null && o.avgR != null ? round(s.avgR - o.avgR) : null, early: s.n < minN });
  }
  return out;
}

/* ───────────────────────── psychology ───────────────────────── */

export interface PsychRow extends Stat { label: string; quote?: { tradeId: string; date: string; text: string } }

export interface Psychology {
  confidence: PsychRow[];
  honesty: PsychRow[];
  late: PsychRow[];
  afterResult: PsychRow[];
  nth: PsychRow[];
  words: PsychRow[];
  promises: PsychRow[];
}

export const DEFAULT_EMOTION_WORDS = ['fear', 'fomo', 'revenge', 'rushed', 'impatient', 'hesitat', 'bored', 'tired', 'confident', 'calm', 'greedy', 'frustrat'];

/** The first sentence of a trade's writing that holds a word. */
function sentenceWith(t: Trade, re: RegExp): string | null {
  for (const body of [t.lesson ?? '', t.explanation ?? '']) for (const s of sentences(body, false)) if (re.test(s)) return s.length > 200 ? `${s.slice(0, 197)}…` : s;
  return null;
}

const wordRe = (w: string) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');

export function psychology(ts: readonly Trade[], opts: { lateHour: number; words: readonly string[] }): Psychology {
  const row = (label: string, xs: Trade[]): PsychRow => ({ label, ...statOf(xs) });
  const localHour = (t: Trade) => +t.date.slice(11, 13);
  const byDay = new Map<string, Trade[]>();
  for (const t of ts) { const d = t.date.slice(0, 10); byDay.set(d, [...(byDay.get(d) ?? []), t]); }
  const prev = new Map<string, Trade | null>(); const nth = new Map<string, number>();
  for (const list of byDay.values()) list.forEach((t, i) => { prev.set(t.id, i ? list[i - 1] : null); nth.set(t.id, i + 1); });
  return {
    confidence: [1, 2, 3, 4, 5].map((c) => row(`${'★'.repeat(c)}`, ts.filter((t) => t.confidence_at_entry === c))).filter((r) => r.n),
    honesty: [row('Graded before the outcome', ts.filter((t) => !t.graded_post_hoc)), row('Graded after the fact', ts.filter((t) => t.graded_post_hoc))].filter((r) => r.n),
    late: [row(`Before ${opts.lateHour}:00`, ts.filter((t) => localHour(t) >= 5 && localHour(t) < opts.lateHour)), row(`${opts.lateHour}:00 or later`, ts.filter((t) => localHour(t) >= opts.lateHour || localHour(t) < 5))].filter((r) => r.n),
    afterResult: [
      row('First trade of the day', ts.filter((t) => !prev.get(t.id))),
      row('Right after a win', ts.filter((t) => prev.get(t.id)?.outcome === 'Win')),
      row('Right after a loss', ts.filter((t) => prev.get(t.id)?.outcome === 'Loss')),
    ].filter((r) => r.n),
    nth: [row('1st of the day', ts.filter((t) => nth.get(t.id) === 1)), row('2nd', ts.filter((t) => nth.get(t.id) === 2)), row('3rd or later', ts.filter((t) => (nth.get(t.id) ?? 0) >= 3))].filter((r) => r.n),
    words: opts.words.filter(Boolean).map((w) => {
      const re = wordRe(w);
      const hits = ts.filter((t) => re.test(`${t.lesson ?? ''} ${t.explanation ?? ''}`));
      const q = [...hits].reverse().map((t) => ({ t, s: sentenceWith(t, re) })).find((x) => x.s);
      return { ...row(w, hits), quote: q ? { tradeId: q.t.id, date: q.t.date.slice(0, 10), text: q.s! } : undefined };
    }).filter((r) => r.n).sort((a, b) => (a.avgR ?? 0) - (b.avgR ?? 0)),
    promises: [row('Logged past a Path promise', ts.filter((t) => (t.overrides ?? []).length > 0)), row('Within every promise', ts.filter((t) => !(t.overrides ?? []).length))].filter((r) => r.n),
  };
}

/* ───────────────────────── news ───────────────────────── */

export interface NewsView {
  week: Array<{ day: string; events: StoredNews[]; trades: number; netR: number }>;
  redDays: Stat; otherDays: Stat;
  nearEvents: Stat; awayFromEvents: Stat;
  byEvent: Array<{ title: string } & Stat>;
}

const minutesApart = (a: string, b: string) => Math.abs(Date.parse(`${a}:00Z`) - Date.parse(`${b}:00Z`)) / 60000;
/** CPI m/m and CPI y/y are one event; so are the FOMC statement and its press conference. */
export const eventFamily = (title: string) => {
  const t = title.toLowerCase();
  if (/fomc|federal funds|fed chair|powell/.test(t)) return 'FOMC';
  if (/non-?farm|nfp/.test(t)) return 'NFP';
  if (/\bcpi\b|consumer price/.test(t)) return 'CPI';
  if (/\bppi\b|producer price/.test(t)) return 'PPI';
  if (/gdp/.test(t)) return 'GDP';
  if (/jobless|unemployment claims/.test(t)) return 'Jobless claims';
  if (/retail sales/.test(t)) return 'Retail sales';
  if (/pmi|ism/.test(t)) return 'PMI / ISM';
  return title.replace(/\s+(m\/m|y\/y|q\/q)$/i, '');
};

export function newsView(ts: readonly Trade[], events: readonly StoredNews[], opts: { monday: string; currencies: readonly string[]; window: number; red: ReadonlySet<string> }): NewsView {
  const want = new Set(opts.currencies);
  const high = events.filter((e) => e.impact === 'High' && want.has(e.currency) && !e.all_day);
  const add = (day: string, n: number) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = add(opts.monday, i);
    const dayTs = ts.filter((t) => t.date.startsWith(day));
    return { day, events: events.filter((e) => e.at.startsWith(day) && want.has(e.currency)), trades: dayTs.length, netR: round(dayTs.reduce((s, t) => s + R(t), 0)) };
  });
  const near = (t: Trade) => high.some((e) => minutesApart(e.at, t.date.slice(0, 16)) <= opts.window);
  const families = new Map<string, Set<string>>();
  for (const e of high) { const f = eventFamily(e.title); families.set(f, new Set([...(families.get(f) ?? []), e.at.slice(0, 10)])); }
  return {
    week,
    redDays: statOf(ts.filter((t) => opts.red.has(t.date.slice(0, 10)))), otherDays: statOf(ts.filter((t) => !opts.red.has(t.date.slice(0, 10)))),
    nearEvents: statOf(ts.filter(near)), awayFromEvents: statOf(ts.filter((t) => !near(t))),
    byEvent: [...families].map(([title, days]) => ({ title, ...statOf(ts.filter((t) => days.has(t.date.slice(0, 10)))) })).filter((x) => x.n).sort((a, b) => (a.avgR ?? 0) - (b.avgR ?? 0)),
  };
}

/* ───────────────────────── Ask your journal ───────────────────────── */

export interface AskQuote { tradeId: string; date: string; r: number | null; text: string; from: 'lesson' | 'explanation' }
export interface AskAnswer {
  intent: string;
  title: string;
  /** Plain sentences, in the order to read them. */
  lines: string[];
  facts: Array<{ label: string; value: string; tone?: 'win' | 'loss' }>;
  quotes: AskQuote[];
  /** Questions worth asking next. */
  follow: string[];
}

export const SUGGESTED_QUESTIONS = [
  'Where am I losing the most?',
  'What do my best trades have in common?',
  'Am I improving?',
  'What is my most expensive mistake?',
  'When should I stop trading for the day?',
  'What is my best time to trade?',
  'How do I do on news days?',
  'How do I trade after a loss?',
];

const STOP = new Set('the a an and or but of in on at to for with my me i am is are was were be do does did what when where how why which who have has had it its this that these those from about any all can should would could most more less best worst than then just really very much many my your our trade trades trading'.split(' '));

const signedR = (v: number | null) => (v == null ? '—' : `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(2)}R`);
const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`);
const statLine = (s: Stat) => `${s.n} trade${s.n === 1 ? '' : 's'}, ${pct(s.winRate)} won, ${signedR(s.avgR)} a trade, ${signedR(s.netR)} in all`;

/** The sentence of a trade's writing most worth quoting: its lesson first. */
function quoteOf(t: Trade, re?: RegExp): AskQuote | null {
  for (const [from, body] of [['lesson', t.lesson ?? ''], ['explanation', t.explanation ?? '']] as const) {
    const ss = sentences(body, false).filter((s) => s.length >= 20);
    const s = re ? ss.find((x) => re.test(x)) : ss[0];
    if (s) return { tradeId: t.id, date: t.date.slice(0, 10), r: t.r_multiple, text: s.length > 220 ? `${s.slice(0, 217)}…` : s, from };
  }
  return null;
}
const quotesFrom = (xs: readonly Trade[], n: number, re?: RegExp) => [...xs].reverse().map((t) => quoteOf(t, re)).filter((q): q is AskQuote => !!q).slice(0, n);

interface Segment { dim: string; value: string; trades: Trade[] }

function segments(ts: readonly Trade[]): Segment[] {
  const out: Segment[] = [];
  const by = (dim: string, key: (t: Trade) => string | string[] | null) => {
    const m = new Map<string, Trade[]>();
    for (const t of ts) { const k = key(t); for (const v of (Array.isArray(k) ? k : k ? [k] : [])) m.set(v, [...(m.get(v) ?? []), t]); }
    for (const [value, trades] of m) out.push({ dim, value, trades });
  };
  by('setup', (t) => t.setup_type); by('session', (t) => t.session);
  by('weekday', (t) => WEEKDAY_FULL[clockOf(t, 'ny').weekday]);
  by('half-hour', (t) => { const m = clockOf(t, 'ny').mins; const b = Math.floor(m / 30) * 30; return `${hhmm(b)}–${hhmm(b + 30)} New York`; });
  by('target', (t) => t.target_type); by('direction', (t) => t.direction);
  by('mistake', (t) => t.mistake_tags ?? []);
  by('pattern', (t) => themesOf(t).map((id) => THEMES.find((d) => d.id === id)?.title ?? id));
  return out;
}

const DIM_SAY: Record<string, (v: string) => string> = {
  setup: (v) => `the ${v} setup`, session: (v) => `the ${v} session`, weekday: (v) => `${v}s`, 'half-hour': (v) => v,
  target: (v) => `targeting ${v}`, direction: (v) => `${v.toLowerCase()}s`, mistake: (v) => `trades tagged “${v}”`, pattern: (v) => `“${v.toLowerCase()}” in your writing`,
};

export interface AskOptions { minN: number; quotes: number }

/** Answers a question about the journal from the journal. Rule-based and local; says how much it is counting. */
export function ask(question: string, trades: readonly Trade[], opts: AskOptions, extra: { red?: ReadonlySet<string>; events?: readonly StoredNews[] } = {}): AskAnswer {
  const ts = analysable(trades);
  const q = question.toLowerCase().trim();
  const all = statOf(ts);
  const follow = (not: string) => SUGGESTED_QUESTIONS.filter((x) => x !== not).slice(0, 3);
  if (!ts.length) return { intent: 'empty', title: 'Nothing to read yet', lines: ['There are no settled trades with an R in this view. Log a few and ask again.'], facts: [], quotes: [], follow: [] };
  const early = (n: number) => (n < opts.minN ? ` (only ${n} trade${n === 1 ? '' : 's'} — an early signal, not a verdict)` : '');

  // Time
  if (/\b(time|hour|session|morning|afternoon|o'?clock|half-hour)\b/.test(q) && !/\bstop\b/.test(q)) {
    const tv = timeView(ts, 'ny', opts.minN);
    const sessions = tv.sessions.filter((s) => s.n).sort((a, b) => (b.avgR ?? 0) - (a.avgR ?? 0));
    return {
      intent: 'time', title: 'Your time of day',
      lines: [
        tv.best ? `Best half-hour: ${hhmm(tv.best.from)}–${hhmm(tv.best.from + 30)} New York — ${statLine(tv.best)}.` : `No half-hour has ${opts.minN}+ trades yet.`,
        tv.worst ? `Worst: ${hhmm(tv.worst.from)}–${hhmm(tv.worst.from + 30)} — ${statLine(tv.worst)}.` : '',
        ...sessions.map((s) => `${s.label}: ${statLine(s)}.`),
      ].filter(Boolean),
      facts: sessions.map((s) => ({ label: s.label, value: signedR(s.avgR), tone: (s.avgR ?? 0) < 0 ? 'loss' as const : 'win' as const })),
      quotes: [], follow: follow(SUGGESTED_QUESTIONS[5]),
    };
  }

  // Where am I losing?
  if (/los(e|ing|t)|leak|worst|bleed|cost(s|ing)? me|hurt/.test(q) && !/mistake/.test(q)) {
    const segs = segments(ts).filter((s) => s.trades.length >= opts.minN).map((s) => ({ ...s, stat: statOf(s.trades) })).filter((s) => s.stat.netR < 0)
      .sort((a, b) => a.stat.netR - b.stat.netR).slice(0, 3);
    if (!segs.length) return { intent: 'losing', title: 'Where you lose the most', lines: [`No group of ${opts.minN} or more trades is net negative. Overall: ${statLine(all)}.`], facts: [], quotes: [], follow: follow(SUGGESTED_QUESTIONS[0]) };
    const top = segs[0];
    return {
      intent: 'losing', title: 'Where you lose the most',
      lines: [
        `Most of the damage is in ${DIM_SAY[top.dim](top.value)}: ${statLine(top.stat)}.`,
        ...segs.slice(1).map((s) => `Then ${DIM_SAY[s.dim](s.value)}: ${signedR(s.stat.netR)} over ${s.stat.n} trades.`),
        `For scale, everything together: ${statLine(all)}.`,
      ],
      facts: segs.map((s) => ({ label: DIM_SAY[s.dim](s.value), value: signedR(s.stat.netR), tone: 'loss' as const })),
      quotes: quotesFrom(top.trades.filter((t) => R(t) < 0), opts.quotes),
      follow: follow(SUGGESTED_QUESTIONS[0]),
    };
  }

  // What do my best trades share?
  if (/best|winn|common|share|edge|what works|working/.test(q)) {
    const sorted = [...ts].sort((a, b) => R(b) - R(a));
    const top = sorted.slice(0, Math.max(3, Math.ceil(ts.length / 4))).filter((t) => R(t) > 0);
    const rest = ts.filter((t) => !top.includes(t));
    const lifts = confluenceDefs(ts).map((d) => {
      const inTop = top.filter((t) => d.test(t) === true).length / Math.max(1, top.length);
      const inRest = rest.filter((t) => d.test(t) === true).length / Math.max(1, rest.length);
      return { label: d.label, group: d.group, inTop, inRest, lift: inTop - inRest };
    }).filter((x) => x.inTop >= 0.5 && x.lift >= 0.15 && x.group !== 'Mistakes').sort((a, b) => b.lift - a.lift).slice(0, 5);
    return {
      intent: 'best', title: 'What your best trades share',
      lines: [
        `Your best ${top.length} trades (the top quarter by R) average ${signedR(statOf(top).avgR)}${early(top.length)}.`,
        lifts.length ? 'They have these far more often than the rest:' : 'No single condition sets them apart yet — more trades will sharpen this.',
        ...lifts.map((l) => `· ${l.label} — ${pct(l.inTop)} of the best, ${pct(l.inRest)} of the rest.`),
      ],
      facts: lifts.map((l) => ({ label: l.label, value: `${pct(l.inTop)} vs ${pct(l.inRest)}`, tone: 'win' as const })),
      quotes: quotesFrom(top, opts.quotes),
      follow: follow(SUGGESTED_QUESTIONS[1]),
    };
  }

  // Am I improving?
  if (/improv|progress|getting better|better than|trend/.test(q)) {
    const n = Math.min(20, Math.floor(ts.length / 2));
    if (n < 3) return { intent: 'improving', title: 'Are you improving?', lines: [`Too few trades to compare two stretches (${ts.length}).`], facts: [], quotes: [], follow: follow(SUGGESTED_QUESTIONS[2]) };
    const recent = ts.slice(-n); const before = ts.slice(-2 * n, -n);
    const a = statOf(before); const b = statOf(recent);
    const ruleShare = (xs: Trade[]) => xs.filter((t) => t.followed_rules === false || (t.mistake_tags ?? []).length > 0).length / xs.length;
    const post = (xs: Trade[]) => xs.filter((t) => t.graded_post_hoc).length / xs.length;
    const better = (b.avgR ?? 0) > (a.avgR ?? 0);
    return {
      intent: 'improving', title: 'Are you improving?',
      lines: [
        `Your last ${n} trades against the ${n} before them:`,
        `· Average R: ${signedR(a.avgR)} → ${signedR(b.avgR)}${better ? ' — better' : ' — not yet better'}.`,
        `· Win rate: ${pct(a.winRate)} → ${pct(b.winRate)}.`,
        `· Trades with a mistake or a broken rule: ${pct(ruleShare(before))} → ${pct(ruleShare(recent))}.`,
        `· Graded after the fact: ${pct(post(before))} → ${pct(post(recent))}.`,
        n < 10 ? 'Two short stretches swing a lot; treat this as a direction, not a result.' : 'Process numbers (mistakes, honesty) move before results do.',
      ],
      facts: [{ label: 'Avg R', value: `${signedR(a.avgR)} → ${signedR(b.avgR)}`, tone: better ? 'win' : 'loss' }],
      quotes: quotesFrom(recent, Math.min(2, opts.quotes)),
      follow: follow(SUGGESTED_QUESTIONS[2]),
    };
  }

  // Most expensive mistake
  if (/mistake|error|wrong|habit/.test(q)) {
    const tags = new Map<string, Trade[]>();
    for (const t of ts) for (const m of t.mistake_tags ?? []) tags.set(m, [...(tags.get(m) ?? []), t]);
    const ranked = [...tags].map(([m, xs]) => ({ m, s: statOf(xs), xs })).sort((a, b) => a.s.netR - b.s.netR);
    if (!ranked.length) return { intent: 'mistake', title: 'Your most expensive mistake', lines: ['No trade in view carries a mistake tag.'], facts: [], quotes: [], follow: follow(SUGGESTED_QUESTIONS[3]) };
    const top = ranked[0];
    return {
      intent: 'mistake', title: 'Your most expensive mistake',
      lines: [`“${top.m}”: ${statLine(top.s)}${early(top.s.n)}.`, ...ranked.slice(1, 4).map((r) => `Then “${r.m}”: ${signedR(r.s.netR)} over ${r.s.n}.`)],
      facts: ranked.slice(0, 4).map((r) => ({ label: r.m, value: signedR(r.s.netR), tone: 'loss' as const })),
      quotes: quotesFrom(top.xs, opts.quotes),
      follow: follow(SUGGESTED_QUESTIONS[3]),
    };
  }

  // When to stop
  if (/stop|quit|walk away|how many|overtrad|enough for/.test(q)) {
    const p = psychology(ts, { lateHour: 13, words: [] });
    const third = p.nth.find((r) => r.label.startsWith('3rd'));
    const afterLoss = p.afterResult.find((r) => r.label.includes('loss'));
    return {
      intent: 'stop', title: 'When to stop for the day',
      lines: [
        ...p.nth.map((r) => `${r.label}: ${statLine(r)}.`),
        afterLoss ? `Right after a loss: ${statLine(afterLoss)}${early(afterLoss.n)}.` : 'No trade yet came right after a loss on the same day.',
        third && (third.avgR ?? 0) < 0 ? 'Your third trade of a day loses on average — two is the natural stop.' : 'Nothing here says the count of trades is what hurts; look at what comes after a loss.',
      ],
      facts: p.nth.map((r) => ({ label: r.label, value: signedR(r.avgR), tone: (r.avgR ?? 0) < 0 ? 'loss' as const : 'win' as const })),
      quotes: afterLoss ? quotesFrom(ts.filter((t) => R(t) < 0), Math.min(2, opts.quotes), /stop|again|revenge|chas|one more|forc/i) : [],
      follow: follow(SUGGESTED_QUESTIONS[4]),
    };
  }

  // News
  if (/news|fomc|cpi|nfp|red folder|data release|ppi/.test(q)) {
    const red = extra.red ?? new Set<string>();
    const on = statOf(ts.filter((t) => red.has(t.date.slice(0, 10))));
    const off = statOf(ts.filter((t) => !red.has(t.date.slice(0, 10))));
    return {
      intent: 'news', title: 'News days',
      lines: on.n ? [`On red-folder days: ${statLine(on)}${early(on.n)}.`, `Other days: ${statLine(off)}.`]
        : ['No trade in view fell on a red-folder day (from the morning check-in or the news calendar).'],
      facts: on.n ? [{ label: 'Red-folder days', value: signedR(on.avgR), tone: (on.avgR ?? 0) < 0 ? 'loss' : 'win' }, { label: 'Other days', value: signedR(off.avgR) }] : [],
      quotes: quotesFrom(ts.filter((t) => red.has(t.date.slice(0, 10))), opts.quotes), follow: follow(SUGGESTED_QUESTIONS[6]),
    };
  }

  // Feelings
  if (/after a loss|revenge|tilt|feel|emotion|confiden|fear|fomo|psych|mindset|tired|bored/.test(q)) {
    const p = psychology(ts, { lateHour: 13, words: DEFAULT_EMOTION_WORDS });
    const lines = [
      ...p.afterResult.map((r) => `${r.label}: ${statLine(r)}.`),
      ...p.confidence.map((r) => `Confidence ${r.label}: ${signedR(r.avgR)} over ${r.n}.`),
      ...p.words.slice(0, 3).map((w) => `Trades where you wrote “${w.label}…”: ${signedR(w.avgR)} over ${w.n}.`),
    ];
    return {
      intent: 'psychology', title: 'How you trade, by how you felt', lines,
      facts: p.afterResult.map((r) => ({ label: r.label, value: signedR(r.avgR), tone: (r.avgR ?? 0) < 0 ? 'loss' as const : 'win' as const })),
      quotes: p.words.slice(0, opts.quotes).map((w) => w.quote).filter((x): x is NonNullable<typeof x> => !!x).map((x) => ({ ...x, r: null, from: 'lesson' as const })),
      follow: follow(SUGGESTED_QUESTIONS[7]),
    };
  }

  // A named value: "how do I do on Mondays / iFVG / NY PM / longs"?
  const segs = segments(ts).filter((s) => s.dim !== 'pattern' && s.dim !== 'half-hour');
  const named = segs.filter((s) => {
    const v = s.value.toLowerCase();
    return v.length >= 3 && (q.includes(v) || (s.dim === 'weekday' && q.includes(v.slice(0, 3)) && /\b(mon|tue|wed|thu|fri|sat|sun)/.test(q)) || (s.dim === 'direction' && q.includes(`${v}s`)));
  });
  if (named.length) {
    const s = named.sort((a, b) => b.value.length - a.value.length)[0];
    const st = statOf(s.trades); const others = statOf(ts.filter((t) => !s.trades.includes(t)));
    return {
      intent: 'segment', title: `${s.value[0].toUpperCase()}${s.value.slice(1)}`,
      lines: [`${DIM_SAY[s.dim](s.value)[0].toUpperCase()}${DIM_SAY[s.dim](s.value).slice(1)}: ${statLine(st)}${early(st.n)}.`, `Everything else: ${statLine(others)}.`],
      facts: [{ label: s.value, value: signedR(st.avgR), tone: (st.avgR ?? 0) < 0 ? 'loss' : 'win' }, { label: 'Everything else', value: signedR(others.avgR) }],
      quotes: quotesFrom(s.trades, opts.quotes), follow: follow(''),
    };
  }

  // Fallback: what did I write about <words>?
  const words = q.replace(/[^a-z0-9\s'-]/g, ' ').split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w));
  if (words.length) {
    const res = words.map((w) => new RegExp(`\\b${w.replace(/s$/, '')}`, 'i'));
    const hits = ts.filter((t) => res.some((re) => re.test(`${t.lesson ?? ''} ${t.explanation ?? ''}`)));
    if (hits.length) {
      const st = statOf(hits);
      return {
        intent: 'search', title: `What you wrote about “${words.join(' ')}”`,
        lines: [`${hits.length} trade${hits.length === 1 ? '' : 's'} mention it: ${statLine(st)}${early(st.n)}.`],
        facts: [{ label: 'Trades mentioning it', value: signedR(st.avgR), tone: (st.avgR ?? 0) < 0 ? 'loss' : 'win' }],
        quotes: quotesFrom(hits, opts.quotes, new RegExp(res.map((r) => r.source).join('|'), 'i')), follow: follow(''),
      };
    }
  }
  return {
    intent: 'unknown', title: 'Not sure what to look for',
    lines: ['I answer from your trades and your own writing — try one of these, or name a setup, a session, a weekday, a tag or a word you write in your lessons.'],
    facts: [], quotes: [], follow: SUGGESTED_QUESTIONS.slice(0, 4),
  };
}
