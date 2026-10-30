/**
 * Blind Re-grade (Edge Engine §7): grading your own setups with the outcome
 * hidden — everything right of the entry line masked, no date, no result.
 *
 *  - the session: up to 10 setups, a seeded mix (by ISO week) of taken
 *    trades and missed setups that have an entry line, preferring ones never
 *    graded blind; up to 3 repeats graded blind 14+ days ago, for test–retest
 *  - self-consistency: weighted kappa (quadratic) between first and later
 *    blind grades of the same setup — 1 is perfect agreement, 0 is chance
 *  - blind grade vs outcome: the cleanest test of whether the rubric works
 */
import { mulberry32, hashString } from './rng';
import type { Trade } from '../types';

export const SESSION_SIZE = 10; export const RETEST_DAYS = 14; export const BLIND_CATS = ['A+', 'A', 'B', 'C', 'F'] as const;
const CAT: Record<string, number> = { 'A+': 0, A: 1, 'A-': 1, 'B+': 2, B: 2, 'B-': 2, C: 3, D: 3, F: 4 };

export interface BlindGrade { trade_id: string; created_at: string; grade: string }

export function isoWeek(day: string): string {
  // ISO 8601: the week with the year's first Thursday is week 1.
  const d = new Date(`${day.slice(0, 10)}T12:00:00Z`);
  const dow = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - dow);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  return `${d.getUTCFullYear()}-W${String(Math.ceil(((d.getTime() - start) / 86_400_000 + 1) / 7)).padStart(2, '0')}`;
}

/** The setups for this week's session. `pool`: trades and missed setups with a screenshot and an entry line. */
export function blindSession(pool: readonly Trade[], graded: readonly BlindGrade[], today: string): Trade[] {
  const rand = mulberry32(hashString(`blind|${isoWeek(today)}|${pool.length}`));
  const shuffle = <T,>(xs: T[]) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const last = new Map<string, string>(); for (const g of graded) if (!last.has(g.trade_id) || g.created_at > last.get(g.trade_id)!) last.set(g.trade_id, g.created_at);
  const cutoff = new Date(Date.parse(`${today.slice(0, 10)}T12:00:00Z`) - RETEST_DAYS * 86_400_000).toISOString();
  const fresh = shuffle(pool.filter((t) => !last.has(t.id)));
  const retest = shuffle(pool.filter((t) => last.has(t.id) && last.get(t.id)! < cutoff)).slice(0, 3);
  return shuffle([...retest, ...fresh].slice(0, SESSION_SIZE));
}

/** Quadratic-weighted kappa between two raters (here: you, then you again). */
export function weightedKappa(pairs: ReadonlyArray<[string, string]>): { n: number; kappa: number | null } {
  const ps = pairs.map(([a, b]) => [CAT[a], CAT[b]] as const).filter(([a, b]) => a != null && b != null);
  const n = ps.length; const K = BLIND_CATS.length;
  if (n < 2) return { n, kappa: null };
  const O = Array.from({ length: K }, () => new Array(K).fill(0));
  for (const [a, b] of ps) O[a][b] += 1;
  const ra = O.map((r) => r.reduce((x, y) => x + y, 0)); const cb = O[0].map((_, j) => O.reduce((x, r) => x + r[j], 0));
  let num = 0; let den = 0;
  for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) { const w = ((i - j) ** 2) / ((K - 1) ** 2); num += w * O[i][j]; den += w * (ra[i] * cb[j]) / n; }
  return { n, kappa: den > 0 ? 1 - num / den : 1 };
}

/** First vs latest blind grade of each setup graded 14+ days apart. */
export function retestPairs(graded: readonly BlindGrade[]): Array<[string, string]> {
  const by = new Map<string, BlindGrade[]>(); for (const g of graded) by.set(g.trade_id, [...(by.get(g.trade_id) ?? []), g]);
  return [...by.values()].flatMap((gs) => {
    const s = [...gs].sort((a, b) => a.created_at.localeCompare(b.created_at)); const a = s[0]; const b = s[s.length - 1];
    return s.length > 1 && Date.parse(b.created_at) - Date.parse(a.created_at) >= RETEST_DAYS * 86_400_000 ? [[a.grade, b.grade] as [string, string]] : [];
  });
}

/** This week's count and the days since the last session, for the Stats counter. */
export function blindCounter(graded: readonly BlindGrade[], today: string): { thisWeek: number; total: number; daysSince: number | null } {
  const wk = isoWeek(today);
  const lastAt = graded.reduce<string | null>((m, g) => (!m || g.created_at > m ? g.created_at : m), null);
  return { thisWeek: graded.filter((g) => isoWeek(g.created_at) === wk).length, total: graded.length,
    daysSince: lastAt ? Math.floor((Date.parse(`${today.slice(0, 10)}T12:00:00Z`) - Date.parse(lastAt)) / 86_400_000) : null };
}
