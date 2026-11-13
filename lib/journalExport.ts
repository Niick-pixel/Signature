import { isBacktest, isHypothetical, isTaken } from './domain';
import { replayDayLines, type ReplayDay } from './replay';
import { RUBRIC_V2_EXPLAINER, isRubricV2, rubricName, v2Result } from './decision';
import { prepMarkdown, type SessionPrep } from './prep';
import { toMarkdown } from './sanitise';
import type { DailyReview, JournalPage, Trade } from './types';

/**
 * The journal, written to be discussed with Claude.
 *
 * The monthly review is about the trading. This is about the writing: every
 * journal page in the range, in order, with the day it was written on laid
 * out beneath it — the morning, the chart prep, the trades and their lessons.
 * The pages are the point; the rest is there so that "I keep writing about
 * patience" can be set against what the patient and impatient days did.
 */

export type JournalRange = '30' | '90' | 'all';
export const JOURNAL_RANGES: Array<{ id: JournalRange; label: string; note: string }> = [
  { id: '30', label: 'Last 30 days', note: 'the recent run — enough for a pattern, short enough to read closely' },
  { id: '90', label: 'Last 90 days', note: 'a quarter — for the themes that come and go' },
  { id: 'all', label: 'Everything', note: 'every page ever written' },
];

export interface JournalExportInput {
  /** Replay days (048): a backtest replay date carries its plan. */
  replayDays?: ReplayDay[];
  range: JournalRange;
  pages: JournalPage[];
  trades: Trade[];
  reviews: DailyReview[];
  preps: SessionPrep[];
  now?: Date;
}

const dayOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "Monday 29 September 2026" — spelled out here so no machine's locale changes the document. */
const longDate = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS[m - 1]} ${y}`;
};
const r1 = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}R`;
const oneLine = (s: string, max = 400) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

export function journalExport(input: JournalExportInput): { filename: string; markdown: string; pages: number; days: number } {
  const now = input.now ?? new Date();
  const from = input.range === 'all' ? '0000-00-00' : dayOf(new Date(now.getTime() - Number(input.range) * 86_400_000));
  const to = dayOf(now);
  const inRange = (day: string) => day >= from && day <= to;

  const pages = input.pages.filter((p) => inRange(p.day));
  // Days lived: a backtest's date is a replayed chart's, or none at all.
  const trades = input.trades.filter((t) => !isBacktest(t.account) && inRange(t.date.slice(0, 10)));
  const reviews = new Map(input.reviews.filter((r) => inRange(r.day)).map((r) => [r.day, r]));
  const preps = new Map(input.preps.filter((p) => inRange(p.day)).map((p) => [p.day, p]));

  const days = [...new Set([
    ...pages.map((p) => p.day), ...trades.map((t) => t.date.slice(0, 10)),
    ...[...reviews.values()].filter((r) => r.checked_in_at || r.what_happened || r.notes).map((r) => r.day),
    ...preps.keys(),
  ])].sort();

  const label = JOURNAL_RANGES.find((r) => r.id === input.range)!.label.toLowerCase();
  const out: string[] = [];
  const h = (s: string) => out.push('', s, '');
  const p = (s: string) => out.push(s);

  const real = trades.filter((t) => !isHypothetical(t.account) && isTaken(t.outcome));
  p(`# My trading journal — ${label}`);
  p('');
  p(`_Exported ${now.toISOString().slice(0, 16).replace('T', ' ')} UTC from Signature, a local journal kept by one discretionary trader of NQ/MNQ futures (an ICT-style iFVG model). ${pages.length} page${pages.length === 1 ? '' : 's'} written across ${days.length} day${days.length === 1 ? '' : 's'}; ${real.length} real trade${real.length === 1 ? '' : 's'} taken, ${r1(real.reduce((s, t) => s + (t.r_multiple ?? 0), 0))} in total._`);

  h('## For Claude: what this is and what I would like');
  p('These are the pages of my trading journal — the writing that is not about a single trade: ideas, frustrations, summaries of a week, things I noticed. Under each day, for context, is what I planned that morning (the check-in and the chart prep) and how I actually traded, with the lesson I wrote on each trade.');
  p('');
  p('Please:');
  p('1. Read everything in order before answering.');
  p('2. Tell me what I keep coming back to — the themes, worries, ideas and rules that recur — with the dates, quoting my own words.');
  p('3. Show me where what I write and what I do disagree: rules I state and then break, plans I write in the morning and trade against, things I say I have learned and then repeat.');
  p('4. Look at the days around my pages: do I write mostly after losses? Is my writing different before good days and bad ones — longer, shorter, more certain, more emotional?');
  p('5. Ask me the questions I seem to be avoiding.');
  p('');
  p('Be direct. I would rather hear the uncomfortable pattern than a summary of what I wrote.');
  h('### How to read the context');
  p('- **R** is the result in multiples of the risk taken (+2.0R is twice the risk won).');
  p('- **Grades** (A+, A, B, C, F) come from my pre-trade checklist and are frozen at entry. A+ is a perfect checklist; failing the model gate (no nameable sweep, or more than one gap) caps a trade at C.');
  p(`- ${RUBRIC_V2_EXPLAINER} Each trade names its rubric.`);
  p('- **Missed** trades are setups I saw and did not take, logged with the result they would have had. They are hypothetical and not in any total.');
  p('- **Passed** means I deliberately chose not to take the setup.');

  // Pinned pages from outside the range: the ones I marked as mattering.
  const pinned = input.pages.filter((pg) => pg.pinned && !inRange(pg.day));
  if (pinned.length) {
    h('## Pinned pages (outside the range, pinned because they matter to me)');
    for (const pg of pinned) { h(`### ${pg.day} — ${pg.title || 'Untitled'}`); p(toMarkdown(pg.body) || pg.plain || '_Empty page._'); }
  }

  h('## Day by day');
  if (days.length === 0) p('_Nothing written or traded in this range._');
  for (const day of days) {
    const date = longDate(day);
    const dayPages = pages.filter((pg) => pg.day === day).sort((a, b) => a.created_at.localeCompare(b.created_at));
    const dayTrades = trades.filter((t) => t.date.slice(0, 10) === day).sort((a, b) => a.date.localeCompare(b.date));
    const taken = dayTrades.filter((t) => !isHypothetical(t.account) && isTaken(t.outcome));
    h(`### ${date}${dayPages.length ? ` — ${dayPages.length} page${dayPages.length === 1 ? '' : 's'}` : ''}${taken.length ? ` · ${taken.length} trade${taken.length === 1 ? '' : 's'}, ${r1(taken.reduce((s, t) => s + (t.r_multiple ?? 0), 0))}` : ''}`);

    const r = reviews.get(day);
    if (r && (r.checked_in_at || r.bias || r.sleep_hours != null)) {
      const bits = [
        r.checked_in_at ? `checked in ${new Date(r.checked_in_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : null,
        r.sleep_hours != null ? `slept ${r.sleep_hours}h` : null,
        r.state_of_mind != null ? `mind ${r.state_of_mind}/5` : null,
        r.bias_direction || r.bias ? `bias ${[r.bias_direction, r.bias].filter(Boolean).join(' — ')}` : null,
        r.news ? `news ${r.news}${r.news_note ? ` (${r.news_note})` : ''}` : null,
        r.trades_planned != null ? `planned at most ${r.trades_planned}` : null,
      ].filter(Boolean);
      p(`**Morning:** ${bits.join(' · ')}`);
    }
    const prep = preps.get(day);
    if (prep) { p('**Chart prep:**'); p(prepMarkdown(prep)); }
    // Backtests replaying this date were traded against a replay plan (048): the plan first, then its trades below.
    for (const rd of (input.replayDays ?? []).filter((x) => x.replay_date === day)) {
      const { heading, lines } = replayDayLines(rd);
      p(`**${heading}:**`);
      p(lines.join('\n'));
    }
    if (dayTrades.length) {
      p('**Trades:**');
      for (const t of dayTrades) {
        const time = new Date(t.date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        const v2 = isRubricV2(t);
        const result = (v2 ? v2Result(t) : null) ?? (t.outcome === 'Not taken' ? 'passed' : `${t.outcome}${t.r_multiple != null ? ` ${r1(t.r_multiple)}` : ''}`);
        const parts = [
          `${time} ${t.instrument} ${t.direction}`, t.setup_type, `grade ${t.grade_letter ?? '—'} (${rubricName(t)})`, result,
          v2 ? `rows ${['row_sweep', 'row_inversion', 'row_path', 'row_target'].map((k) => t[k as 'row_sweep'] ?? '—').join('/')}, scenario ${t.plan_scenario ?? '—'}, decided in ${t.decision_seconds ?? '—'}s${t.grade_override ? ', against a no-trade grade' : ''}` : null,
          `why: ${t.reason}`, isHypothetical(t.account) ? 'MISSED (hypothetical)' : t.account,
          t.mistake_tags.length ? `went wrong: ${t.mistake_tags.join(', ')}` : null,
          (t.worked_tags ?? []).length ? `worked: ${t.worked_tags.join(', ')}` : null,
          (t.market_tags ?? []).length ? `market: ${t.market_tags.join(', ')}` : null,
        ].filter(Boolean);
        p(`- ${parts.join(' · ')}`);
        if (t.lesson?.trim()) p(`  - Lesson: "${oneLine(t.lesson)}"`);
      }
    }
    if (r?.what_happened?.trim()) p(`**What happened (evening):** ${oneLine(r.what_happened, 800)}`);
    for (const pg of dayPages) {
      h(`#### Page: ${pg.title || 'Untitled'}${pg.pinned ? ' (pinned)' : ''}`);
      p(toMarkdown(pg.body) || pg.plain || '_Empty page._');
    }
  }

  return {
    filename: `signature-journal-${input.range === 'all' ? 'all' : `${input.range}d`}-${to}`,
    markdown: `${out.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`,
    pages: pages.length,
    days: days.length,
  };
}
