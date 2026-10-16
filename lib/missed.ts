import { countsInStats, isHypothetical, isReal, isTaken, SESSIONS, SKIP_REASONS } from './domain';
import { GRADE_LETTERS } from './grade';
import type { DailyReview, Trade } from './types';

/**
 * Where you freeze.
 *
 * A missed trade on its own is an anecdote; the question worth answering is
 * whether the misses cluster — on a setup, in a session, after a loss, on a
 * rattled morning. So every missed trade is set against the trades you DID
 * take under the same condition, and each condition gets a miss rate: of the
 * setups you saw there, how many went without you.
 *
 * A rate is compared with your usual one, never read alone: missing 30% of
 * London setups means nothing if you miss 30% of everything. The sentences at
 * the top only name a condition when it is clearly above the usual AND has
 * enough setups behind it that the difference is not four trades of luck.
 */

/** Below this many setups (missed + taken), a row is shown but not trusted. */
export const MIN_SEEN = 6;
/** A condition is only named when its miss rate is at least this multiple of the usual. */
export const NAMED_LIFT = 1.5;

export interface MissRow {
  label: string;
  missed: number;
  taken: number;
  /** missed / (missed + taken). */
  rate: number | null;
  /** rate / the usual rate. */
  lift: number | null;
  /** What the missed ones would have paid, in R. */
  wouldR: number;
  /** Of the missed ones with an R, how many would have won. */
  wouldWin: number;
  thin: boolean;
}

export interface MissDimension {
  key: 'setup' | 'session' | 'grade' | 'earlier' | 'mind' | 'news' | 'weekday';
  title: string;
  rows: MissRow[];
}

export interface MissReason { reason: string; count: number; wouldR: number }

export interface MissedPatterns {
  missed: number;
  taken: number;
  /** The usual miss rate, across everything. */
  rate: number | null;
  dimensions: MissDimension[];
  /** Why they were missed, as the form records it. */
  reasons: MissReason[];
  /** Plain sentences, strongest first, only for conditions with enough behind them. */
  findings: string[];
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}R`;
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** What happened earlier the same day, among the trades actually taken. */
function earlierToday(t: Trade, takenByDay: Map<string, Trade[]>): string {
  const before = (takenByDay.get(t.date.slice(0, 10)) ?? []).filter((x) => x.id !== t.id && x.date < t.date);
  if (before.length === 0) return 'First setup of the day';
  const last = before[before.length - 1];
  if (last.outcome === 'Loss') return 'Right after a loss';
  if (last.outcome === 'Win') return 'Right after a win';
  return 'After a flat trade';
}

function mindOf(review: DailyReview | undefined): string | null {
  const m = review?.state_of_mind;
  if (m == null) return null;
  return m <= 2 ? 'Rattled morning (1–2)' : m === 3 ? 'Middling morning (3)' : 'Clear morning (4–5)';
}

function newsOf(review: DailyReview | undefined): string | null {
  const n = review?.news;
  return n === 'High' ? 'High-impact news day' : n === 'Medium' ? 'Medium news day' : n === 'None' ? 'Quiet news day' : null;
}

export function missedPatterns(trades: Trade[], reviews: DailyReview[] = []): MissedPatterns {
  // Hindsight stays out: only a miss written down before the move counts.
  const missed = trades.filter((t) => isHypothetical(t.account) && t.deleted_at == null && countsInStats(t));
  // What you did take, in the accounts you trade — never a backtest, whose
  // "setups seen" were chosen with the chart already scrolled.
  const taken = trades.filter((t) => isReal(t.account)
    && t.deleted_at == null && isTaken(t.outcome));
  const seen = missed.length + taken.length;
  const rate = seen ? missed.length / seen : null;

  const takenByDay = new Map<string, Trade[]>();
  for (const t of [...taken].sort((a, b) => a.date.localeCompare(b.date))) {
    const day = t.date.slice(0, 10);
    takenByDay.set(day, [...(takenByDay.get(day) ?? []), t]);
  }
  const reviewByDay = new Map(reviews.map((r) => [r.day, r]));
  const review = (t: Trade) => reviewByDay.get(t.date.slice(0, 10));

  const dimension = (
    key: MissDimension['key'], title: string, keyOf: (t: Trade) => string | null, order?: readonly string[],
  ): MissDimension => {
    const labels = new Set<string>();
    const m = new Map<string, Trade[]>();
    const k = new Map<string, number>();
    for (const t of missed) { const l = keyOf(t); if (l == null) continue; labels.add(l); m.set(l, [...(m.get(l) ?? []), t]); }
    for (const t of taken) { const l = keyOf(t); if (l == null) continue; labels.add(l); k.set(l, (k.get(l) ?? 0) + 1); }
    const rows = [...labels].map((label): MissRow => {
      const mm = m.get(label) ?? [];
      const kk = k.get(label) ?? 0;
      const n = mm.length + kk;
      const r = n ? mm.length / n : null;
      const withR = mm.filter((t) => t.r_multiple != null);
      return {
        label, missed: mm.length, taken: kk, rate: r,
        lift: r != null && rate ? r / rate : null,
        wouldR: withR.reduce((s, t) => s + (t.r_multiple ?? 0), 0),
        wouldWin: withR.filter((t) => (t.r_multiple ?? 0) > 0).length,
        thin: n < MIN_SEEN,
      };
    });
    rows.sort(order
      ? (a, b) => order.indexOf(a.label) - order.indexOf(b.label)
      : (a, b) => (b.missed + b.taken) - (a.missed + a.taken));
    return { key, title, rows };
  };

  const dimensions: MissDimension[] = [
    dimension('earlier', 'Earlier that day', (t) => earlierToday(t, takenByDay),
      ['First setup of the day', 'Right after a win', 'Right after a loss', 'After a flat trade']),
    dimension('setup', 'Setup', (t) => t.setup_type),
    dimension('grade', 'Grade', (t) => t.grade_letter, GRADE_LETTERS),
    dimension('session', 'Session', (t) => t.session, SESSIONS),
    dimension('mind', 'Morning', (t) => mindOf(review(t)),
      ['Rattled morning (1–2)', 'Middling morning (3)', 'Clear morning (4–5)']),
    dimension('news', 'News', (t) => newsOf(review(t)), ['High-impact news day', 'Medium news day', 'Quiet news day']),
    dimension('weekday', 'Day of the week', (t) => WEEKDAYS[new Date(`${t.date.slice(0, 10)}T12:00:00`).getDay()],
      [...WEEKDAYS.slice(1), WEEKDAYS[0]]),
  // One value compares nothing: every iFVG in an all-iFVG journal is "usual".
  ].filter((d) => d.rows.length > 1);

  const reasons: MissReason[] = [...SKIP_REASONS, null].map((reason) => {
    const group = missed.filter((t) => t.skip_reason === reason);
    return {
      reason: reason ?? 'Not said',
      count: group.length,
      wouldR: group.reduce((s, t) => s + (t.r_multiple ?? 0), 0),
    };
  }).filter((r) => r.count > 0).sort((a, b) => b.count - a.count);

  /*
    The sentences. A condition earns one when its miss rate is well above the
    usual one, it has enough setups behind it, and at least three misses — a
    2-of-3 is a coincidence however large its rate. Strongest first, three at
    most: a wall of findings is read as none.
  */
  const findings: string[] = [];
  if (rate != null) {
    const named = dimensions.flatMap((d) => d.rows.map((row) => ({ d, row })))
      .filter(({ row }) => !row.thin && row.missed >= 3 && (row.lift ?? 0) >= NAMED_LIFT)
      .sort((a, b) => (b.row.lift ?? 0) - (a.row.lift ?? 0))
      .slice(0, 3);
    for (const { row } of named) {
      const paid = row.wouldR !== 0 ? ` Those ${row.missed} would have made ${signed(row.wouldR)}.` : '';
      const lead = phrase(row.label);
      // "On A+ setups, you miss 40% of them"; "Right after a loss, you miss 60% of setups".
      const of = lead.endsWith('setups') ? 'of them' : 'of setups';
      findings.push(`${lead}${lead.endsWith(',') ? '' : ','} you miss ${pct(row.rate!)} ${of} (${row.missed} of ${row.missed + row.taken}) — ${(row.lift!).toFixed(1)}× your usual ${pct(rate)}.${paid}`);
    }
    // The costliest good setups to freeze on: A+ and A misses that would have paid.
    const best = missed.filter((t) => (t.grade_letter === 'A+' || t.grade_letter === 'A') && t.r_multiple != null);
    const bestR = best.reduce((s, t) => s + (t.r_multiple ?? 0), 0);
    if (best.length >= 3 && bestR > 0) {
      findings.push(`You froze on ${best.length} A-grade setups. Taken, they would have made ${signed(bestR)} — hesitation is costing you your best trades, not your worst.`);
    }
  }

  return { missed: missed.length, taken: taken.length, rate, dimensions, reasons, findings };
}

/** "Right after a loss" → "Right after a loss,"; a setup name → "On iFVG setups". */
function phrase(label: string): string {
  if (/^(First|Right|After)/.test(label)) return `${label === 'First setup of the day' ? 'On the first setup of the day' : label},`;
  if (/morning|news day/.test(label)) return `On a ${label.charAt(0).toLowerCase()}${label.slice(1)},`;
  if (/^(Asia|London|NY)/.test(label)) return `In ${label},`;
  if ((GRADE_LETTERS as readonly string[]).includes(label)) return `On ${label} setups`;
  if (WEEKDAYS.includes(label)) return `On ${label}s`;
  return `On ${label} setups`;
}
