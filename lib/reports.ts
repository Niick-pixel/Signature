/**
 * Reports: compare two groups of trades, break them down, count the fees,
 * and lay the year out day by day. Pure and client-safe: the server turns
 * trades into flat rows once (reportRow), the page filters and counts them.
 */
import type { Trade } from './types';

export interface ReportRow {
  id: string; day: string; account: string; world: 'real' | 'backtest';
  setup: string; session: string; direction: string; grade: string; outcome: string; instrument: string;
  r: number; money: number | null; fees: number | null; gross: number | null;
  contracts: number | null; holdMin: number | null; nyMin: number | null; weekday: number;
  mistakes: string[]; tags: string[]; maeR: number | null; mfeR: number | null; confidence: number | null;
}

export interface DayCell { day: string; trades: number; kept: number; netR: number; money: number | null; grade: string | null; score: number | null }

const toMin = (hms: string | null) => (hms && /^\d{2}:\d{2}/.test(hms) ? Number(hms.slice(0, 2)) * 60 + Number(hms.slice(3, 5)) : null);

/** One trade as a report row. `gross` is the platform's figure when an execution is linked, else P&L plus fees. */
export function reportRow(t: Trade, o: { tags: string[]; nyMin: number | null; money: number | null; execGross: number | null; backtest: boolean }): ReportRow {
  const day = t.chart_date ?? t.date.slice(0, 10);
  const a = toMin(t.entry_time); const b = toMin(t.exit_time);
  return {
    id: t.id, day, account: t.account, world: o.backtest ? 'backtest' : 'real',
    setup: t.setup_type, session: t.session, direction: t.direction, grade: t.grade_letter, outcome: t.outcome, instrument: t.instrument,
    r: t.r_multiple ?? 0, money: o.money, fees: t.fees_dollars,
    gross: o.execGross ?? (o.money != null && t.fees_dollars != null ? o.money + t.fees_dollars : null),
    contracts: t.contracts, holdMin: a != null && b != null && b >= a ? b - a : null, nyMin: o.nyMin,
    weekday: (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7,
    mistakes: (t.mistake_tags ?? []) as string[], tags: o.tags, maeR: t.mae_r, mfeR: t.mfe_r, confidence: t.confidence_at_entry,
  };
}

/* ───────────────────────── filters ───────────────────────── */

export interface Filter {
  world?: 'real' | 'backtest' | 'all';
  setups?: string[]; sessions?: string[]; directions?: string[]; weekdays?: number[]; grades?: string[];
  mistakes?: string[]; clean?: boolean; tagged?: boolean; tags?: string[]; instruments?: string[];
  from?: string; to?: string;
}

export function applyFilter(rows: readonly ReportRow[], f: Filter): ReportRow[] {
  const has = <T,>(list: T[] | undefined, v: T) => !list?.length || list.includes(v);
  return rows.filter((r) => (f.world == null || f.world === 'all' || r.world === f.world)
    && has(f.setups, r.setup) && has(f.sessions, r.session) && has(f.directions, r.direction) && has(f.weekdays, r.weekday)
    && has(f.grades, r.grade) && has(f.instruments, r.instrument)
    && (!f.mistakes?.length || f.mistakes.some((m) => r.mistakes.includes(m))) && (!f.clean || r.mistakes.length === 0) && (!f.tagged || r.mistakes.length > 0)
    && (!f.tags?.length || f.tags.every((t) => r.tags.includes(t)))
    && (!f.from || r.day >= f.from) && (!f.to || r.day <= f.to));
}

/* ───────────────────────── summary ───────────────────────── */

export interface Summary {
  n: number; wins: number; losses: number; winRate: number | null; avgR: number | null; netR: number;
  avgWinR: number | null; avgLossR: number | null; profitFactor: number | null; money: number | null; fees: number | null;
  avgHold: number | null; maxDD: number; bestR: number | null; worstR: number | null;
  /** Cumulative R after each trade, in order. */
  curve: number[];
}
const round = (v: number, dp = 2) => Math.round(v * 10 ** dp) / 10 ** dp;
const mean = (xs: number[]) => (xs.length ? round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const sum = (xs: Array<number | null>) => { const v = xs.filter((x): x is number => x != null); return v.length ? round(v.reduce((a, b) => a + b, 0)) : null; };

export function summary(rows: readonly ReportRow[]): Summary {
  const rs = [...rows].sort((a, b) => a.day.localeCompare(b.day));
  const wins = rs.filter((r) => r.r > 0); const losses = rs.filter((r) => r.r < 0);
  const won = wins.reduce((s, r) => s + r.r, 0); const lost = -losses.reduce((s, r) => s + r.r, 0);
  let cum = 0; let peak = 0; let dd = 0; const curve: number[] = [];
  for (const r of rs) { cum += r.r; peak = Math.max(peak, cum); dd = Math.min(dd, cum - peak); curve.push(round(cum)); }
  const w = rs.filter((r) => r.outcome === 'Win').length; const l = rs.filter((r) => r.outcome === 'Loss').length;
  return {
    n: rs.length, wins: w, losses: l, winRate: w + l ? round(w / (w + l), 3) : null, avgR: mean(rs.map((r) => r.r)), netR: round(cum),
    avgWinR: mean(wins.map((r) => r.r)), avgLossR: mean(losses.map((r) => r.r)), profitFactor: lost ? round(won / lost) : null,
    money: sum(rs.map((r) => r.money)), fees: sum(rs.map((r) => r.fees)), avgHold: mean(rs.map((r) => r.holdMin).filter((x): x is number => x != null)),
    maxDD: round(dd), bestR: rs.length ? Math.max(...rs.map((r) => r.r)) : null, worstR: rs.length ? Math.min(...rs.map((r) => r.r)) : null, curve,
  };
}

/* ───────────────────────── breakdowns ───────────────────────── */

export interface BreakdownRow extends Omit<Summary, 'curve'> { key: string; label: string }
export interface Breakdown { id: string; title: string; rows: BreakdownRow[] }

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const bucket = (v: number | null, edges: number[], labels: string[]) => {
  if (v == null) return null;
  const i = edges.findIndex((e) => v < e);
  return labels[i === -1 ? labels.length - 1 : i];
};
const HOLD = { edges: [2, 5, 15, 60], labels: ['Under 2 min', '2–5 min', '5–15 min', '15–60 min', 'An hour or more'] };
const OPEN = { edges: [0, 15, 30, 60, 120], labels: ['Before 9:30', '9:30–9:45', '9:45–10:00', '10:00–10:30', '10:30–11:30', 'After 11:30'] };

function group(rows: readonly ReportRow[], keyOf: (r: ReportRow) => string | null, order?: string[]): BreakdownRow[] {
  const m = new Map<string, ReportRow[]>();
  for (const r of rows) { const k = keyOf(r); if (k != null) m.set(k, [...(m.get(k) ?? []), r]); }
  const keys = order ? order.filter((k) => m.has(k)) : [...m.keys()].sort((a, b) => (m.get(b)!.length - m.get(a)!.length) || a.localeCompare(b));
  return keys.map((k) => { const { curve: _c, ...s } = summary(m.get(k)!); void _c; return { key: k, label: k, ...s }; });
}

export function breakdowns(rows: readonly ReportRow[], tagName: (id: string) => string | null = () => null): Breakdown[] {
  return [
    { id: 'hold', title: 'Holding time', rows: group(rows, (r) => bucket(r.holdMin, HOLD.edges, HOLD.labels), HOLD.labels) },
    { id: 'open', title: 'Minutes from the NY open', rows: group(rows, (r) => (r.nyMin == null ? null : bucket(r.nyMin - 570, OPEN.edges, OPEN.labels)), OPEN.labels) },
    { id: 'weekday', title: 'Day of the week', rows: group(rows, (r) => WEEKDAYS[r.weekday], WEEKDAYS) },
    { id: 'setup', title: 'Setup', rows: group(rows, (r) => r.setup) },
    { id: 'session', title: 'Session', rows: group(rows, (r) => r.session) },
    { id: 'direction', title: 'Direction', rows: group(rows, (r) => r.direction, ['Long', 'Short']) },
    { id: 'grade', title: 'Grade', rows: group(rows, (r) => r.grade, ['A+', 'A', 'B', 'C', 'D', 'F']) },
    { id: 'size', title: 'Size (contracts)', rows: group(rows, (r) => (r.contracts == null ? null : r.contracts >= 5 ? '5 or more' : String(r.contracts)), ['1', '2', '3', '4', '5 or more']) },
    { id: 'instrument', title: 'Instrument', rows: group(rows, (r) => r.instrument || null) },
    { id: 'confidence', title: 'Confidence at entry', rows: group(rows, (r) => (r.confidence == null ? null : `${r.confidence} of 5`), ['1 of 5', '2 of 5', '3 of 5', '4 of 5', '5 of 5']) },
    { id: 'tags', title: 'Your tags', rows: group(rows.flatMap((r) => r.tags.map((t) => ({ ...r, setup: t }))), (r) => tagName(r.setup)) },
  ].filter((b) => b.rows.length > 0);
}

/** Winners against losers: the habits that differ. */
export function winnersVsLosers(rows: readonly ReportRow[]) {
  const side = (list: ReportRow[]) => ({
    n: list.length,
    hold: mean(list.map((r) => r.holdMin).filter((x): x is number => x != null)),
    size: mean(list.map((r) => r.contracts).filter((x): x is number => x != null)),
    mae: mean(list.map((r) => r.maeR).filter((x): x is number => x != null)),
    mfe: mean(list.map((r) => r.mfeR).filter((x): x is number => x != null)),
    fromOpen: mean(list.map((r) => (r.nyMin == null ? null : r.nyMin - 570)).filter((x): x is number => x != null)),
    confidence: mean(list.map((r) => r.confidence).filter((x): x is number => x != null)),
  });
  return { winners: side(rows.filter((r) => r.r > 0)), losers: side(rows.filter((r) => r.r < 0)) };
}

/* ───────────────────────── fees ───────────────────────── */

export interface FeePeriod { key: string; label: string; trades: number; fees: number; gross: number | null; net: number | null; share: number | null }
export interface FeeReport { total: FeePeriod; months: FeePeriod[]; weeks: FeePeriod[]; perTrade: number | null; perContract: number | null; missing: number }

const mondayOf = (day: string) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
function feePeriod(key: string, label: string, rows: ReportRow[]): FeePeriod {
  const priced = rows.filter((r) => r.fees != null);
  const fees = round(priced.reduce((s, r) => s + (r.fees ?? 0), 0));
  const gross = sum(priced.map((r) => r.gross));
  const net = sum(rows.map((r) => r.money));
  return { key, label, trades: rows.length, fees, gross, net, share: gross ? round(fees / Math.abs(gross), 3) : null };
}

export function feeReport(rows: readonly ReportRow[]): FeeReport {
  const rs = [...rows].sort((a, b) => a.day.localeCompare(b.day));
  const by = (keyOf: (r: ReportRow) => string) => { const m = new Map<string, ReportRow[]>(); for (const r of rs) m.set(keyOf(r), [...(m.get(keyOf(r)) ?? []), r]); return m; };
  const months = [...by((r) => r.day.slice(0, 7))].map(([k, list]) => feePeriod(k, new Date(`${k}-15T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }), list)).reverse();
  const weeks = [...by((r) => mondayOf(r.day))].map(([k, list]) => feePeriod(k, `Week of ${new Date(`${k}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`, list)).reverse().slice(0, 12);
  const priced = rs.filter((r) => r.fees != null);
  const contracts = priced.reduce((s, r) => s + (r.contracts ?? 0), 0);
  const total = feePeriod('all', 'All', rs);
  return { total, months, weeks, perTrade: priced.length ? round(total.fees / priced.length) : null, perContract: contracts ? round(total.fees / contracts) : null, missing: rs.length - priced.length };
}

/* ───────────────────────── tags ───────────────────────── */

export interface TagStat extends Omit<Summary, 'curve'> { id: string; name: string; group: string }
export function tagStats(rows: readonly ReportRow[], groups: ReadonlyArray<{ id: string; name: string; tags: ReadonlyArray<{ id: string; name: string }> }>): TagStat[] {
  return groups.flatMap((g) => g.tags.map((t) => {
    const { curve: _c, ...s } = summary(rows.filter((r) => r.tags.includes(t.id))); void _c;
    return { id: t.id, name: t.name, group: g.name, ...s };
  }));
}
