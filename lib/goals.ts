/**
 * Process goals (feature 8): habits, checked from the journal on their own,
 * day by day — or week by week for study time. Pure. A goal never stops a
 * trade; it only says how often it was kept, the streak, and when it broke.
 */
import { TRADER_UTC_OFFSET_HOURS } from './planMatch';
import type { Trade } from './types';

export type GoalKind = 'session_only' | 'max_trades' | 'stop_after' | 'same_day' | 'pre_graded' | 'no_tag' | 'min_grade' | 'prep_done' | 'study';
export interface GoalParams { sessions?: string[]; n?: number; tag?: string; letter?: string; minutes?: number }
export interface Goal { id: string; kind: GoalKind; title: string; params: GoalParams; start_day: string; end_day: string | null; archived: boolean; created_at: string }
export interface GoalCheckin { goal_id: string; week: string; rating: number | null; note: string | null; created_at: string }

export const GOAL_KINDS: Array<{ kind: GoalKind; label: string; hint: string; unit: 'day' | 'week'; defaults: GoalParams; title: (p: GoalParams) => string }> = [
  { kind: 'session_only', label: 'Only my session', hint: 'Every trade in the sessions you choose.', unit: 'day', defaults: { sessions: ['NY AM'] }, title: (p) => `Only ${(p.sessions ?? []).join(' / ') || 'NY AM'}` },
  { kind: 'max_trades', label: 'A trade limit', hint: 'No more than this many trades in a day.', unit: 'day', defaults: { n: 2 }, title: (p) => `At most ${p.n ?? 2} trade${(p.n ?? 2) === 1 ? '' : 's'} a day` },
  { kind: 'stop_after', label: 'Stop after losses', hint: 'No trade after this many losses in a day.', unit: 'day', defaults: { n: 2 }, title: (p) => `Done after ${p.n ?? 2} loss${(p.n ?? 2) === 1 ? '' : 'es'}` },
  { kind: 'same_day', label: 'Journal the same day', hint: 'Every trade logged on the day it was taken.', unit: 'day', defaults: {}, title: () => 'Journal every trade the same day' },
  { kind: 'pre_graded', label: 'Grade before the outcome', hint: 'Every trade graded before you knew how it ended.', unit: 'day', defaults: {}, title: () => 'Grade every trade before the outcome' },
  { kind: 'no_tag', label: 'Drop a mistake', hint: 'Not one trade with this mistake tag.', unit: 'day', defaults: { tag: 'Chased' }, title: (p) => `No “${p.tag ?? 'Chased'}”` },
  { kind: 'min_grade', label: 'Only good setups', hint: 'Every trade at this grade or better.', unit: 'day', defaults: { letter: 'B' }, title: (p) => `Only ${p.letter ?? 'B'} grade or better` },
  { kind: 'prep_done', label: 'Prep every weekday', hint: 'The chart prep done (4+ steps) Monday to Friday.', unit: 'day', defaults: {}, title: () => 'Chart prep every weekday' },
  { kind: 'study', label: 'Study each week', hint: 'At least this many study minutes a week.', unit: 'week', defaults: { minutes: 120 }, title: (p) => `Study ${p.minutes ?? 120} min a week` },
];

export interface GoalDay { day: string; kept: boolean; why: string }
export interface GoalProgress { units: number; kept: number; share: number | null; streak: number; best: number; lastBroken: GoalDay | null; recent: GoalDay[]; unit: 'day' | 'week'; todayOk: boolean | null }

export interface GoalContext {
  trades: readonly Trade[];
  today: string;
  /** Prep steps done on a day (0 when none). */
  prepDone: (day: string) => number;
  /** Study minutes in the week starting this Monday. */
  studyWeek: (monday: string) => number;
}

const addDays = (day: string, n: number) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const mondayOf = (day: string) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
const weekday = (day: string) => (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
const GRADES = ['F', 'D', 'C', 'B', 'A', 'A+'];
const loggedDay = (t: Trade) => new Date(Date.parse(t.created_at.endsWith('Z') ? t.created_at : `${t.created_at}Z`) + TRADER_UTC_OFFSET_HOURS * 3600_000).toISOString().slice(0, 10);

/** One day's verdict for a day-goal, or null when the day says nothing (no trades). */
function judgeDay(g: Goal, day: string, ts: Trade[], ctx: GoalContext): GoalDay | null {
  const p = g.params;
  if (g.kind === 'prep_done') {
    if (weekday(day) > 4) return null;
    const n = ctx.prepDone(day);
    return { day, kept: n >= 4, why: n ? `${n} of 6 prep steps` : 'No prep' };
  }
  if (!ts.length) return null;
  switch (g.kind) {
    case 'session_only': { const out = ts.filter((t) => !(p.sessions ?? ['NY AM']).includes(t.session)); return { day, kept: !out.length, why: out.length ? `${out.length} outside (${out[0].session})` : `${ts.length} in session` }; }
    case 'max_trades': return { day, kept: ts.length <= (p.n ?? 2), why: `${ts.length} trade${ts.length === 1 ? '' : 's'}` };
    case 'stop_after': {
      let losses = 0; let after = 0;
      for (const t of ts) { if (losses >= (p.n ?? 2)) after += 1; if (t.outcome === 'Loss') losses += 1; }
      return { day, kept: !after, why: after ? `${after} after the stop` : `${losses} loss${losses === 1 ? '' : 'es'}` };
    }
    case 'same_day': { const late = ts.filter((t) => loggedDay(t) > day); return { day, kept: !late.length, why: late.length ? `${late.length} logged later` : 'All logged that day' }; }
    case 'pre_graded': { const post = ts.filter((t) => t.graded_post_hoc); return { day, kept: !post.length, why: post.length ? `${post.length} graded after` : 'All graded before' }; }
    case 'no_tag': { const hit = ts.filter((t) => ((t.mistake_tags ?? []) as string[]).includes(p.tag ?? '')); return { day, kept: !hit.length, why: hit.length ? `${hit.length} tagged` : 'None' }; }
    case 'min_grade': {
      const min = GRADES.indexOf(p.letter ?? 'B');
      const low = ts.filter((t) => GRADES.indexOf(t.grade_letter) < min);
      return { day, kept: !low.length, why: low.length ? `${low.length} below ${p.letter ?? 'B'}` : `All ${p.letter ?? 'B'}+` };
    }
    default: return null;
  }
}

export function goalProgress(g: Goal, ctx: GoalContext): GoalProgress {
  const spec = GOAL_KINDS.find((k) => k.kind === g.kind)!;
  const end = g.end_day && g.end_day < ctx.today ? g.end_day : ctx.today;
  const verdicts: GoalDay[] = [];
  if (spec.unit === 'week') {
    for (let m = mondayOf(g.start_day); m <= end; m = addDays(m, 7)) {
      const mins = Math.round(ctx.studyWeek(m));
      const current = m === mondayOf(ctx.today);
      // The week still running counts only once it is met.
      if (current && mins < (g.params.minutes ?? 120)) continue;
      verdicts.push({ day: m, kept: mins >= (g.params.minutes ?? 120), why: `${mins} min` });
    }
  } else {
    const live = ctx.trades.filter((t) => !t.deleted_at && !t.undated && t.status !== 'Planned' && t.account !== 'Missed' && !t.account.startsWith('Backtest'));
    const byDay = new Map<string, Trade[]>();
    for (const t of live) { const d = t.date.slice(0, 10); if (d >= g.start_day && d <= end) byDay.set(d, [...(byDay.get(d) ?? []), t]); }
    for (let d = g.start_day; d <= end; d = addDays(d, 1)) {
      const v = judgeDay(g, d, (byDay.get(d) ?? []).sort((a, b) => a.date.localeCompare(b.date)), ctx);
      // Today's prep counts once it is done; a missing prep this morning is not yet a miss.
      if (v && !(g.kind === 'prep_done' && d === ctx.today && !v.kept)) verdicts.push(v);
    }
  }
  let streak = 0;
  for (let i = verdicts.length - 1; i >= 0 && verdicts[i].kept; i -= 1) streak += 1;
  let best = 0; let run = 0;
  for (const v of verdicts) { run = v.kept ? run + 1 : 0; best = Math.max(best, run); }
  const kept = verdicts.filter((v) => v.kept).length;
  const broken = verdicts.filter((v) => !v.kept);
  const todayV = verdicts.find((v) => v.day === ctx.today);
  return {
    units: verdicts.length, kept, share: verdicts.length ? Math.round((kept / verdicts.length) * 100) / 100 : null,
    streak, best, lastBroken: broken.length ? broken[broken.length - 1] : null, recent: verdicts.slice(-14), unit: spec.unit,
    todayOk: todayV ? todayV.kept : null,
  };
}

export const currentMonday = mondayOf;
