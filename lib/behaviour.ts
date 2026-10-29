/**
 * Three reads on behaviour, not setups. Pure: the page hands in analysable
 * trades (settled, with an R, one world) and gets numbers and sentences.
 *
 *  - Mistake cost: what each mistake tag cost, in R and dollars, against the
 *    trades that carried no mistake at all.
 *  - What if: the same trades with a rule applied — only A setups, stop after
 *    one loss, first trade only — as a second equity curve.
 *  - Tilt: re-entries after a loss that came faster than your usual wait, or
 *    bigger. A warning in hindsight, never a block.
 */
import { pnlOf } from './stats';
import type { Trade } from './types';

const round = (v: number, dp = 2) => Math.round(v * 10 ** dp) / 10 ** dp;
const R = (t: Trade) => t.r_multiple ?? 0;
/** The trading day: a backtest's replayed session where there is one. */
export const dayOf = (t: Pick<Trade, 'date' | 'chart_date'>) => t.chart_date ?? t.date.slice(0, 10);
const byTime = (a: Trade, b: Trade) => (dayOf(a) + entryAt(a)).localeCompare(dayOf(b) + entryAt(b));
/** Entry as HH:MM:SS on the trade's own clock. */
const entryAt = (t: Pick<Trade, 'date' | 'entry_time'>) => (t.entry_time && /^\d{2}:\d{2}/.test(t.entry_time) ? t.entry_time.slice(0, 5) : t.date.slice(11, 16)) || '00:00';
const mins = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

/* ───────────────────────── mistake cost ───────────────────────── */

export interface MistakeRow {
  tag: string; n: number; netR: number; avgR: number;
  /** R given up against your clean trades: n × (avg here − clean avg). Negative is a cost. */
  vsCleanR: number;
  /** The same in dollars, where the trades carry a risk or a P&L. Null when none do. */
  money: number | null; vsCleanMoney: number | null;
  /** Count in each of the last three months, oldest first. */
  months: number[];
  line: string;
  tradeIds: string[];
}
export interface MistakeCost {
  since: string | null; trades: number; clean: { n: number; avgR: number | null; netR: number };
  tagged: number; rows: MistakeRow[];
  /** All tagged trades together, against clean — overlapping tags counted once. */
  totalVsCleanR: number; totalVsCleanMoney: number | null;
  headline: string;
}

const signedR = (v: number) => `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(2)}R`;
const usd = (v: number) => `${v < 0 ? '−' : ''}$${Math.abs(Math.round(v)).toLocaleString('en-US')}`;
const addMonths = (day: string, n: number) => { const d = new Date(`${day.slice(0, 7)}-01T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); };

/** `since`: only trades on or after this day (the quarter, 90 days…); null for all. */
export function mistakeCost(all: readonly Trade[], since: string | null, today: string): MistakeCost {
  const ts = all.filter((t) => !since || dayOf(t) >= since);
  const tags = (t: Trade) => ((t.mistake_tags ?? []) as string[]).filter(Boolean);
  const clean = ts.filter((t) => !tags(t).length);
  const cleanAvg = clean.length ? clean.reduce((s, t) => s + R(t), 0) / clean.length : null;
  // A dollar per R for each trade: the risk, or its P&L over its R.
  const perR = (t: Trade) => (t.risk_dollars ? t.risk_dollars : (() => { const p = pnlOf(t); return p != null && R(t) ? Math.abs(p / R(t)) : null; })());
  const gap = (t: Trade) => (cleanAvg == null ? 0 : R(t) - cleanAvg);
  const moneyGap = (list: Trade[]) => { const priced = list.filter((t) => perR(t) != null); return priced.length ? priced.reduce((s, t) => s + gap(t) * perR(t)!, 0) : null; };
  const months = [addMonths(today, -2), addMonths(today, -1), today.slice(0, 7)];

  const byTag = new Map<string, Trade[]>();
  for (const t of ts) for (const g of tags(t)) byTag.set(g, [...(byTag.get(g) ?? []), t]);
  const rows: MistakeRow[] = [...byTag].map(([tag, list]) => {
    const net = list.reduce((s, t) => s + R(t), 0);
    const priced = list.map(pnlOf).filter((v): v is number => v != null);
    const vs = round(list.reduce((s, t) => s + gap(t), 0));
    const vsMoney = moneyGap(list);
    const line = cleanAvg == null
      ? `${list.length} trade${list.length === 1 ? '' : 's'}, ${signedR(round(net))} in all — no clean trades yet to set it against.`
      : vs < 0
        ? `“${tag}” cost ${signedR(-vs).replace('+', '')}${vsMoney != null ? ` (${usd(-vsMoney)})` : ''} against your clean trades — ${list.length} time${list.length === 1 ? '' : 's'}, ${signedR(round(net / list.length))} each where clean ones average ${signedR(round(cleanAvg))}.`
        : `“${tag}” did not cost you here: ${signedR(round(net / list.length))} each, against ${signedR(round(cleanAvg))} clean.`;
    return {
      tag, n: list.length, netR: round(net), avgR: round(net / list.length), vsCleanR: vs,
      money: priced.length ? round(priced.reduce((a, b) => a + b, 0)) : null, vsCleanMoney: vsMoney == null ? null : round(vsMoney),
      months: months.map((m) => list.filter((t) => dayOf(t).startsWith(m)).length), line,
      tradeIds: [...list].sort((a, b) => byTime(b, a)).map((t) => t.id),
    };
  }).sort((a, b) => a.vsCleanR - b.vsCleanR);

  const tagged = ts.filter((t) => tags(t).length);
  const totalVs = round(tagged.reduce((s, t) => s + gap(t), 0));
  const totalMoney = moneyGap(tagged);
  const headline = !tagged.length ? 'No mistake tags in this stretch. Either a clean run, or the tags are not being used.'
    : cleanAvg == null ? `Every trade here carries a mistake tag — nothing clean to compare with yet.`
      : totalVs < 0
        ? `Mistakes cost you ${signedR(-totalVs).replace('+', '')}${totalMoney != null ? `, about ${usd(-totalMoney)},` : ''} against how your clean trades did — over ${tagged.length} of ${ts.length} trades.`
        : `The tagged trades did no worse than the clean ones here (${tagged.length} of ${ts.length}).`;
  return { since, trades: ts.length, clean: { n: clean.length, avgR: cleanAvg == null ? null : round(cleanAvg), netR: round(clean.reduce((s, t) => s + R(t), 0)) },
    tagged: tagged.length, rows, totalVsCleanR: totalVs, totalVsCleanMoney: totalMoney == null ? null : round(totalMoney), headline };
}

/* ───────────────────────── what if ───────────────────────── */

export type WhatIfRule = 'grade_a' | 'grade_b' | 'stop1' | 'stop2' | 'first' | 'max2' | 'ny_am' | 'no_mistakes' | 'confident' | 'no_tilt';
export const WHAT_IF_RULES: Array<{ id: WhatIfRule; label: string; hint: string }> = [
  { id: 'grade_a', label: 'Only A and A+', hint: 'Skip every trade graded below A.' },
  { id: 'grade_b', label: 'B or better', hint: 'Skip C, D and F setups.' },
  { id: 'stop1', label: 'Stop after 1 loss', hint: 'Nothing more that day after the first loss.' },
  { id: 'stop2', label: 'Stop after 2 losses', hint: 'Nothing more that day after the second loss.' },
  { id: 'first', label: 'First trade only', hint: 'One trade a day: the first.' },
  { id: 'max2', label: 'At most 2 a day', hint: 'The first two trades of each day.' },
  { id: 'ny_am', label: 'NY AM only', hint: 'Skip every other session.' },
  { id: 'no_mistakes', label: 'No mistake tags', hint: 'As if every tagged trade had been passed.' },
  { id: 'confident', label: 'Confidence 4+', hint: 'Only trades taken at 4 or 5 confidence (unrated ones stay).' },
  { id: 'no_tilt', label: 'No tilt trades', hint: 'Skip the fast or sized-up re-entries after a loss.' },
];
const GRADE_RANK: Record<string, number> = { 'A+': 5, A: 4, B: 3, C: 2, D: 1, F: 0 };

export interface WhatIfSide { n: number; netR: number; winRate: number | null; maxDD: number; money: number | null }
export interface WhatIf {
  rules: WhatIfRule[]; actual: WhatIfSide; then: WhatIfSide; skipped: number;
  /** Skipped trades' own result: what leaving them out removes. */
  skippedR: number;
  /** Cumulative R after each trade in time order, both lines on the same x. */
  curve: Array<{ id: string; day: string; actual: number; then: number; kept: boolean }>;
  line: string;
}

function side(ts: Trade[]): WhatIfSide {
  let cum = 0; let peak = 0; let dd = 0;
  for (const t of ts) { cum += R(t); peak = Math.max(peak, cum); dd = Math.min(dd, cum - peak); }
  const w = ts.filter((t) => t.outcome === 'Win').length; const l = ts.filter((t) => t.outcome === 'Loss').length;
  const priced = ts.map(pnlOf).filter((v): v is number => v != null);
  return { n: ts.length, netR: round(cum), winRate: w + l ? round(w / (w + l), 3) : null, maxDD: round(dd), money: priced.length ? round(priced.reduce((a, b) => a + b, 0)) : null };
}

export function whatIf(all: readonly Trade[], rules: readonly WhatIfRule[]): WhatIf {
  const ts = [...all].sort(byTime);
  const tiltIds = rules.includes('no_tilt') ? new Set(tilt(ts).events.map((e) => e.tradeId)) : new Set<string>();
  const keep = new Set<string>();
  const perDay = new Map<string, { kept: number; losses: number }>();
  for (const t of ts) {
    const d = perDay.get(dayOf(t)) ?? { kept: 0, losses: 0 };
    perDay.set(dayOf(t), d);
    const g = GRADE_RANK[t.grade_letter] ?? 0;
    const ok = !(rules.includes('grade_a') && g < 4) && !(rules.includes('grade_b') && g < 3)
      && !(rules.includes('stop1') && d.losses >= 1) && !(rules.includes('stop2') && d.losses >= 2)
      && !(rules.includes('first') && d.kept >= 1) && !(rules.includes('max2') && d.kept >= 2)
      && !(rules.includes('ny_am') && t.session !== 'NY AM')
      && !(rules.includes('no_mistakes') && ((t.mistake_tags ?? []) as string[]).length > 0)
      && !(rules.includes('confident') && t.confidence_at_entry != null && t.confidence_at_entry < 4)
      && !tiltIds.has(t.id);
    // The day's count and losses follow what would have been taken: a skipped loss never happened.
    if (ok) { keep.add(t.id); d.kept += 1; if (t.outcome === 'Loss') d.losses += 1; }
  }
  const kept = ts.filter((t) => keep.has(t.id));
  const skipped = ts.filter((t) => !keep.has(t.id));
  let a = 0; let b = 0;
  const curve = ts.map((t) => { a += R(t); if (keep.has(t.id)) b += R(t); return { id: t.id, day: dayOf(t), actual: round(a), then: round(b), kept: keep.has(t.id) }; });
  const actual = side(ts); const then = side(kept);
  const diff = round(then.netR - actual.netR);
  const line = !rules.length ? 'Pick a rule to see your trades with it.'
    : !skipped.length ? 'You already traded this way — the rule would not have skipped a single trade.'
      : `${skipped.length} trade${skipped.length === 1 ? '' : 's'} skipped (${signedR(round(skipped.reduce((s, t) => s + R(t), 0)))} between them). `
        + (diff > 0 ? `You would be ${signedR(diff)} better off` : diff < 0 ? `You would be ${signedR(-diff).replace('+', '')} worse off` : 'Same result')
        + `${then.maxDD > actual.maxDD ? `, with a shallower worst drawdown (${signedR(then.maxDD)} against ${signedR(actual.maxDD)})` : ''}.`;
  return { rules: [...rules], actual, then, skipped: skipped.length, skippedR: round(skipped.reduce((s, t) => s + R(t), 0)), curve, line };
}

/* ───────────────────────── tilt ───────────────────────── */

export type TiltKind = 'fast' | 'bigger' | 'after_two';
export const TILT_LABEL: Record<TiltKind, string> = { fast: 'Back in fast after a loss', bigger: 'Sized up after a loss', after_two: 'Kept going after two losses' };
export interface TiltEvent { tradeId: string; day: string; at: string; gap: number | null; kinds: TiltKind[]; r: number; prevR: number }
export interface Tilt {
  /** Your usual wait between trades in a day, minutes (median), when there are enough. */
  usualWait: number | null;
  /** The bar for "fast": half the usual wait, never under 3 minutes; 10 when there is no usual yet. */
  fastUnder: number;
  events: TiltEvent[];
  /** Re-entries after a loss, split: tilted against patient. */
  tilted: { n: number; avgR: number | null; winRate: number | null; netR: number };
  patient: { n: number; avgR: number | null; winRate: number | null; netR: number };
  line: string;
}

const statLite = (ts: Trade[]) => {
  const w = ts.filter((t) => t.outcome === 'Win').length; const l = ts.filter((t) => t.outcome === 'Loss').length;
  const net = ts.reduce((s, t) => s + R(t), 0);
  return { n: ts.length, avgR: ts.length ? round(net / ts.length) : null, winRate: w + l ? round(w / (w + l), 3) : null, netR: round(net) };
};

export function tilt(all: readonly Trade[]): Tilt {
  const ts = [...all].sort(byTime);
  const days = new Map<string, Trade[]>();
  for (const t of ts) days.set(dayOf(t), [...(days.get(dayOf(t)) ?? []), t]);
  const gapOf = (prev: Trade, next: Trade) => {
    const out = prev.exit_time && /^\d{2}:\d{2}/.test(prev.exit_time) ? prev.exit_time.slice(0, 5) : entryAt(prev);
    const g = mins(entryAt(next)) - mins(out);
    return Number.isFinite(g) && g >= 0 ? g : null;
  };
  const waits: number[] = [];
  for (const list of days.values()) for (let i = 1; i < list.length; i += 1) { const g = gapOf(list[i - 1], list[i]); if (g != null && list[i - 1].outcome !== 'Loss') waits.push(g); }
  waits.sort((a, b) => a - b);
  const usual = waits.length >= 5 ? waits[Math.floor(waits.length / 2)] : null;
  const fastUnder = usual == null ? 10 : Math.max(3, Math.round(usual / 2));

  const events: TiltEvent[] = []; const afterLoss: Trade[] = [];
  for (const list of days.values()) {
    let losses = 0;
    for (let i = 1; i < list.length; i += 1) {
      const prev = list[i - 1]; const t = list[i];
      if (prev.outcome === 'Loss') losses += 1;
      if (prev.outcome !== 'Loss') continue;
      afterLoss.push(t);
      const gap = gapOf(prev, t);
      const kinds: TiltKind[] = [];
      if (gap != null && gap < fastUnder) kinds.push('fast');
      const bigger = (t.contracts != null && prev.contracts != null && t.contracts > prev.contracts)
        || (t.risk_dollars != null && prev.risk_dollars != null && t.risk_dollars > prev.risk_dollars * 1.2);
      if (bigger) kinds.push('bigger');
      if (losses >= 2) kinds.push('after_two');
      if (kinds.length) events.push({ tradeId: t.id, day: dayOf(t), at: entryAt(t), gap, kinds, r: R(t), prevR: R(prev) });
    }
  }
  const ids = new Set(events.map((e) => e.tradeId));
  const tilted = statLite(afterLoss.filter((t) => ids.has(t.id)));
  const patient = statLite(afterLoss.filter((t) => !ids.has(t.id)));
  const line = !afterLoss.length ? 'No trade has followed a loss on the same day yet.'
    : !events.length ? `All ${afterLoss.length} re-entries after a loss came at your usual pace and size. That is the habit.`
      : `${events.length} of ${afterLoss.length} re-entries after a loss were tilted — ${tilted.avgR != null ? signedR(tilted.avgR) : '—'} each, against ${patient.avgR != null ? signedR(patient.avgR) : '—'} when you waited${usual != null ? ` (your usual wait is ${usual} min)` : ''}.`;
  return { usualWait: usual, fastUnder, events: events.reverse(), tilted, patient, line };
}

export interface TiltNow { lossAt: string; lossR: number; minutesSince: number | null; fastUnder: number; usualWait: number | null; tiltedAvg: number | null; patientAvg: number | null; flaggedToday: number }

/** For the Today panel: when today's last trade was a loss, how long ago, and what waiting has been worth. Null otherwise. */
export function tiltNow(all: readonly Trade[], today: string, nowMinutes: number): TiltNow | null {
  const mine = [...all].filter((t) => dayOf(t) === today).sort(byTime);
  const last = mine[mine.length - 1];
  const tl = tilt(all);
  if (!last || last.outcome !== 'Loss') return null;
  const out = last.exit_time && /^\d{2}:\d{2}/.test(last.exit_time) ? last.exit_time.slice(0, 5) : entryAt(last);
  const since = nowMinutes - mins(out);
  return { lossAt: out, lossR: R(last), minutesSince: since >= 0 ? since : null, fastUnder: tl.fastUnder, usualWait: tl.usualWait,
    tiltedAvg: tl.tilted.avgR, patientAvg: tl.patient.avgR, flaggedToday: tl.events.filter((e) => e.day === today).length };
}
