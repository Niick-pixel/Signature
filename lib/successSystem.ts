/**
 * Success, measured from the journal itself — the process, not the P&L.
 *
 * Each trade is scored on what its own entry says: was it inside the
 * morning's plan, were the rules kept, was it graded before the outcome,
 * did it carry a mistake tag, what do its words say (impulse or patience),
 * was a lesson written, was it a B setup or better. The score is the share
 * of the checks that apply and were kept. Then the question that matters:
 * do your high-scoring trades actually pay? Pure; no model, nothing online.
 */
import { THEMES, sentences, themeSentences, themesOf } from './insights';
import { pnlOf } from './stats';
import type { Trade } from './types';

export type CheckId = 'plan' | 'rules' | 'graded' | 'clean' | 'words' | 'lesson' | 'grade';
export const CHECKS: Array<{ id: CheckId; label: string; hint: string }> = [
  { id: 'plan', label: 'Inside the plan', hint: 'The trade matched that morning’s chart prep (side, sweep, target, time). No prep: not counted.' },
  { id: 'rules', label: 'Rules kept', hint: 'No rule the record can check was broken (session, losses, confidence, size…).' },
  { id: 'graded', label: 'Graded first', hint: 'The grade was locked before the outcome was known.' },
  { id: 'clean', label: 'No mistake tag', hint: 'The trade carries no mistake tag.' },
  { id: 'words', label: 'Patient words', hint: 'Your writing names no impulse — entering early or late, chasing, doubt, one more trade — and, where it says something, says you waited. Counted only when the writing says something either way.' },
  { id: 'lesson', label: 'Lesson written', hint: 'A lesson of at least a short sentence was written for the trade.' },
  { id: 'grade', label: 'B setup or better', hint: 'The setup graded B, A or A+.' },
];

/** The themes that are impulse rather than analysis: written in the trade's own words, they fail "Patient words". */
const IMPULSE = ['late', 'early', 'fear', 'overtrading'];

/*
  Words of a patient, planned trade. Negated forms ("didn't wait", "no
  confirmation") are not counted — those read as the opposite.
*/
const GOOD = /\b(wait(?:ed|ing)? for|patient|patience|confirmation|confirmed|followed (?:my|the) plan|stuck to|according to (?:my |the )?plan|as planned|let it run|held (?:it|to)|clean (?:entry|setup|sweep)|on time|disciplined?)\b/i;
const NEG = /\b(not|didn'?t|did not|no|never|without|wasn'?t|couldn'?t|failed to)\s+(?:\w+\s+){0,2}$/i;

/** The patient phrases in a trade's writing, each once, negations left out. */
export function goodWords(t: Pick<Trade, 'explanation' | 'lesson'>): string[] {
  const out = new Set<string>();
  for (const s of sentences(`${t.explanation ?? ''}\n${t.lesson ?? ''}`, false)) {
    const re = new RegExp(GOOD.source, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) if (!NEG.test(s.slice(0, m.index))) out.add(m[1].toLowerCase());
  }
  return [...out];
}

export interface Check { id: CheckId; passed: boolean | null; detail: string }
export interface ScoredTrade {
  id: string; date: string; setup: string; direction: string; outcome: string; account: string;
  r: number; money: number | null; score: number | null; checks: Check[];
  /** Impulse themes found in the writing or tags, by title. */
  themes: string[];
  good: string[];
  lesson: string | null;
}
export interface Band { id: 'high' | 'mid' | 'low'; label: string; n: number; winRate: number | null; avgR: number | null; netR: number }
export interface Habit { id: CheckId; label: string; hint: string; applies: number; kept: number; keptAvgR: number | null; brokenAvgR: number | null; costR: number }
export interface Week { monday: string; n: number; avgScore: number | null; netR: number }
export interface ThemeCount { id: string; title: string; rule: string; n: number; avgR: number; netR: number }
export interface SuccessSystem {
  n: number; avgScore: number | null; bands: Band[]; habits: Habit[]; weeks: Week[]; themes: ThemeCount[];
  trades: ScoredTrade[];
  line: string; focus: string | null;
}

export interface SuccessContext {
  /** 'in' / 'off' against that day's chart prep, or null when there was none. */
  plan: (t: Trade) => 'in' | 'off' | null;
  /** The rules the record shows broken on this trade (short names). */
  broken: (t: Trade) => string[];
}

const round = (v: number, dp = 2) => Math.round(v * 10 ** dp) / 10 ** dp;
const R = (t: Trade) => t.r_multiple ?? 0;
const signedR = (v: number) => `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(2)}R`;
const mondayOf = (day: string) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
const avg = (xs: number[]) => (xs.length ? round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const GOOD_GRADES = new Set(['A+', 'A', 'B']);

export function scoreTrade(t: Trade, ctx: SuccessContext): ScoredTrade {
  const plan = ctx.plan(t);
  const broken = ctx.broken(t);
  const themes = themesOf(t);
  const impulse = IMPULSE.filter((id) => themeSentences(t, id).length > 0);
  const good = goodWords(t);
  const wrote = `${t.explanation ?? ''}${t.lesson ?? ''}`.trim().length > 0;
  const lesson = (t.lesson ?? '').trim();
  const tags = (t.mistake_tags ?? []) as string[];
  const checks: Check[] = [
    { id: 'plan', passed: plan == null ? null : plan === 'in', detail: plan == null ? 'No chart prep that day' : plan === 'in' ? 'Matched the plan' : 'Off the plan' },
    { id: 'rules', passed: broken.length === 0, detail: broken.length ? broken.join(', ') : 'All kept' },
    { id: 'graded', passed: t.graded_post_hoc == null ? null : !t.graded_post_hoc, detail: t.graded_post_hoc ? 'Graded after the outcome' : 'Graded before' },
    { id: 'clean', passed: tags.length === 0, detail: tags.length ? tags.join(', ') : 'No tags' },
    { id: 'words', passed: impulse.length ? false : good.length ? true : null,
      detail: impulse.length ? THEMES.filter((d) => impulse.includes(d.id)).map((d) => d.title).join(', ') : good.length ? good.join(', ') : wrote ? 'Nothing either way' : 'Nothing written' },
    { id: 'lesson', passed: lesson.length >= 15, detail: lesson.length >= 15 ? 'Written' : 'None' },
    { id: 'grade', passed: t.grade_letter ? GOOD_GRADES.has(t.grade_letter) : null, detail: t.grade_letter ? `Grade ${t.grade_letter}` : 'Ungraded' },
  ];
  const judged = checks.filter((c) => c.passed != null);
  return {
    id: t.id, date: t.date, setup: t.setup_type, direction: t.direction, outcome: t.outcome, account: t.account,
    r: R(t), money: pnlOf(t), score: judged.length ? Math.round((judged.filter((c) => c.passed).length / judged.length) * 100) : null,
    checks, themes: THEMES.filter((d) => themes.includes(d.id)).map((d) => d.title), good,
    lesson: lesson ? sentences(lesson, false)[0] ?? null : null,
  };
}

export function successSystem(trades: readonly Trade[], ctx: SuccessContext): SuccessSystem {
  const ts = trades.filter((t) => t.r_multiple != null).sort((a, b) => a.date.localeCompare(b.date));
  const scored = ts.map((t) => scoreTrade(t, ctx));
  const withScore = scored.filter((s) => s.score != null);

  const band = (id: Band['id'], label: string, test: (s: number) => boolean): Band => {
    const list = withScore.filter((s) => test(s.score!));
    const w = list.filter((s) => s.outcome === 'Win').length; const l = list.filter((s) => s.outcome === 'Loss').length;
    return { id, label, n: list.length, winRate: w + l ? round(w / (w + l), 3) : null, avgR: avg(list.map((s) => s.r)), netR: round(list.reduce((a, s) => a + s.r, 0)) };
  };
  const bands = [band('high', '80 and up', (s) => s >= 80), band('mid', '50 to 79', (s) => s >= 50 && s < 80), band('low', 'Under 50', (s) => s < 50)];

  const habits: Habit[] = CHECKS.map((c) => {
    const kept = scored.filter((s) => s.checks.find((x) => x.id === c.id)!.passed === true);
    const broke = scored.filter((s) => s.checks.find((x) => x.id === c.id)!.passed === false);
    const ka = avg(kept.map((s) => s.r)); const ba = avg(broke.map((s) => s.r));
    return { id: c.id, label: c.label, hint: c.hint, applies: kept.length + broke.length, kept: kept.length, keptAvgR: ka, brokenAvgR: ba,
      costR: ka != null && ba != null ? round(broke.length * (ba - ka)) : 0 };
  });

  const byWeek = new Map<string, ScoredTrade[]>();
  for (const s of scored) { const m = mondayOf(s.date.slice(0, 10)); byWeek.set(m, [...(byWeek.get(m) ?? []), s]); }
  const weeks: Week[] = [...byWeek].sort((a, b) => a[0].localeCompare(b[0])).slice(-12).map(([monday, list]) => ({
    monday, n: list.length, avgScore: (() => { const xs = list.filter((s) => s.score != null).map((s) => s.score!); return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null; })(),
    netR: round(list.reduce((a, s) => a + s.r, 0)),
  }));

  const themes: ThemeCount[] = THEMES.map((d) => {
    const list = scored.filter((s) => s.themes.includes(d.title));
    return { id: d.id, title: d.title, rule: d.rule, n: list.length, avgR: avg(list.map((s) => s.r)) ?? 0, netR: round(list.reduce((a, s) => a + s.r, 0)) };
  }).filter((x) => x.n > 0).sort((a, b) => a.netR - b.netR);

  // Honest about the sample: a band difference within two standard errors is noise, and says so.
  const [hi, , lo] = bands;
  const rsAll = withScore.map((x) => x.r);
  const mAll = rsAll.length ? rsAll.reduce((a, b) => a + b, 0) / rsAll.length : 0;
  const sdAll = rsAll.length > 1 ? Math.sqrt(rsAll.reduce((a, r) => a + (r - mAll) ** 2, 0) / (rsAll.length - 1)) : 1;
  const perBand = Math.ceil((2 * (1.96 + 0.84) ** 2 * sdAll ** 2) / 0.25);
  const se = hi.n && lo.n ? Math.sqrt(sdAll ** 2 / hi.n + sdAll ** 2 / lo.n) : null;
  const line = withScore.length < 6 || hi.avgR == null || lo.avgR == null || se == null
    ? `Can't tell yet — both ends need trades. About ${perBand} trades per band are needed to tell a 0.5R difference.`
    : Math.abs(hi.avgR - lo.avgR) < 2 * se
      ? `Can't tell yet: 80+ trades average ${signedR(hi.avgR)} (${hi.n}), under 50 ${signedR(lo.avgR)} (${lo.n}) — a gap this size is within the noise. About ${perBand} trades per band are needed to tell a 0.5R difference.`
      : hi.avgR > lo.avgR
        ? `Your high-scoring trades did better: ${signedR(hi.avgR)} (${hi.n}) against ${signedR(lo.avgR)} (${lo.n}) under 50.`
        : `Your low-scoring trades did better so far (${signedR(lo.avgR)}, ${lo.n} against ${signedR(hi.avgR)}, ${hi.n}) — read with care: the score uses checks written after the result.`;
  // No "matters most" call from this table: several checks are written after the result (Edge Engine audit).
  const focus: string | null = null;

  return { n: scored.length, avgScore: withScore.length ? avgScoreOf(withScore) : null, bands, habits, weeks, themes, trades: [...scored].reverse(), line, focus };
}

const avgScoreOf = (xs: ScoredTrade[]) => Math.round(xs.reduce((a, s) => a + (s.score ?? 0), 0) / xs.length);
