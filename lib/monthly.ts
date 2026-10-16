import { adherenceOf } from './adherence';
import type { PathEvent } from './path';
import { conditions } from './conditions';
import {
  CHECKLIST_ITEMS, CONTEXT_FLAG_LIST, MONEY_ACCOUNTS, SWEEP_TIER_SPEC, countsInStats, isBacktest, isHypothetical, isTaken, type Account,
} from './domain';
import { openFlagsFor } from './flags';
import { repeatedLessons } from './lessons';
import { missedPatterns } from './missed';
import { aggregate, discipline, edge, modelBreakdowns, money, pnlOf } from './stats';
import type { CashEvent, DailyReview, JournalPage, Trade, TradeShot, WeeklyReview } from './types';
import { prepMarkdown, type SessionPrep } from './prep';

/**
 * A month of the journal, written to be read by Claude.
 *
 * The backup export is complete and unreadable: JSON built for a restore, a
 * CSV built for a spreadsheet. A review conversation needs the opposite — one
 * document that explains its own terms, puts the numbers before the detail,
 * and keeps every trade's reasoning next to its result, so the questions
 * worth asking ("why do my NY AM losses all say 'early'?") can be answered
 * from the page instead of from memory.
 *
 * It opens with what the reader needs to know and what it is being asked to
 * do, then goes from the month's shape down to single trades. Charts travel
 * alongside as files named in the text, so each image can be matched to the
 * trade it belongs to.
 */

export interface MonthlyInput {
  /** YYYY-MM */
  month: string;
  /** Every live (not binned) trade, all accounts, all time. */
  trades: Trade[];
  reviews: DailyReview[];
  weekly: WeeklyReview[];
  pages: JournalPage[];
  cash: CashEvent[];
  /** Extra screenshots per trade id. */
  shots: Map<string, TradeShot[]>;
  /** The chart prep, per day. Optional: an older caller has none. */
  preps?: SessionPrep[];
  /** The Path's record: promises broken, limits overridden, steps done. Optional. */
  pathEvents?: PathEvent[];
  now?: Date;
}

export interface MonthlyChart {
  /** Where it goes in the bundle, e.g. charts/2026-09-03_0941_ab12cd34.png */
  name: string;
  /** Path relative to the screenshots folder. */
  source: string;
}

export interface MonthlyReview {
  filename: string;
  markdown: string;
  charts: MonthlyChart[];
  tradeCount: number;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December'];

const r1 = (v: number | null | undefined) => (v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}R`);
const r2 = (v: number | null | undefined) => (v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}R`);
const usd = (v: number | null | undefined) => (v == null ? '—'
  : `${v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`);
/** A table cell: one line, no pipes. */
const cell = (v: unknown) => (v == null || v === '' ? '—' : String(v).replace(/\|/g, '\\|').replace(/\s*\n+\s*/g, ' / '));
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const ref = (t: Trade) => `T-${t.id.replace(/-/g, '').slice(0, 8)}`;
const when = (t: Trade) => t.date.replace('T', ' ').slice(0, 16);
const ext = (p: string) => (/\.[a-z0-9]+$/i.exec(p)?.[0] ?? '.png').toLowerCase();

function table(head: string[], rows: unknown[][]): string {
  if (rows.length === 0) return '_None._';
  return [
    `| ${head.join(' | ')} |`,
    `| ${head.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(cell).join(' | ')} |`),
  ].join('\n');
}

function previousMonth(month: string): string {
  const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 2, 1));
  return d.toISOString().slice(0, 7);
}

/** One account's month in a row of numbers. */
function numbers(trades: Trade[]) {
  const a = aggregate(trades);
  const e = edge(trades);
  const m = money(trades);
  const d = discipline(trades);
  return { a, e, m, d };
}

function groupRows(trades: Trade[], keyOf: (t: Trade) => string): unknown[][] {
  const groups = new Map<string, Trade[]>();
  for (const t of trades) groups.set(keyOf(t), [...(groups.get(keyOf(t)) ?? []), t]);
  return [...groups.entries()]
    .map(([k, list]) => ({ k, a: aggregate(list) }))
    .filter((g) => g.a.taken > 0)
    .sort((x, y) => x.a.totalR - y.a.totalR)
    .map((g) => [g.k, g.a.taken, pct(g.a.winRate), r1(g.a.totalR), r2(g.a.avgR)]);
}

export function monthlyReview(input: MonthlyInput): MonthlyReview {
  const { month, reviews, weekly, pages, cash, shots } = input;
  // The month lived. Backtests replay other months — or no month at all — and
  // are read on their own Stats page.
  const trades = input.trades.filter((t) => !isBacktest(t.account));
  const now = input.now ?? new Date();
  const title = `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
  const inMonth = (d: string) => d.slice(0, 7) === month;

  const monthTrades = trades.filter((t) => inMonth(t.date)).sort((a, b) => a.date.localeCompare(b.date));
  const real = monthTrades.filter((t) => !isHypothetical(t.account));
  // Hindsight misses are listed with the rest, but counted nowhere.
  const missed = monthTrades.filter((t) => isHypothetical(t.account) && countsInStats(t));
  const prev = previousMonth(month);
  const prevReal = trades.filter((t) => t.date.slice(0, 7) === prev && !isHypothetical(t.account));
  // Live, Funded, Demo in the app's own order; anything older (a backtest) after.
  const rank = (a: Account) => (MONEY_ACCOUNTS.includes(a) ? MONEY_ACCOUNTS.indexOf(a) : 99);
  const accounts = [...new Set(real.map((t) => t.account))].sort((a, b) => rank(a) - rank(b));

  const out: string[] = [];
  const h = (s: string) => out.push('', s, '');
  const p = (s: string) => out.push(s);

  /* ------------------------------------------------------------ preamble */
  p(`# Trading review — ${title}`);
  p('');
  p(`_Exported ${now.toISOString().slice(0, 16).replace('T', ' ')} UTC from Signature, a local trade journal kept by one trader. ${real.length} real trade record${real.length === 1 ? '' : 's'} and ${missed.length} missed trade${missed.length === 1 ? '' : 's'} this month._`);

  h('## For Claude: what this is and what I want');
  p(`I trade NQ / MNQ futures intraday with an ICT-style model built on the **inversion fair value gap (iFVG)**: a sweep of a major level, displacement that leaves a fair value gap, then entry when price returns and a candle closes through the gap the other way. Times are my local time (Costa Rica, UTC−6).`);
  p('');
  p('**How to read the data**');
  p('- **R** is the result in units of the risk taken. +2R made twice what was risked; −1R lost the full risk.');
  p('- **Accounts.** Live and Funded are real money; Eval is a paid prop evaluation; Demo is simulated but traded live. **Missed** holds setups I saw and hesitated on or missed, logged as if taken — the R is what they *would* have made. Missed trades never count in any real total here.');
  p('- **Passed** setups (outcome "Not taken") are ones I deliberately chose not to take. They are journalled but excluded from win rate and R.');
  p('- **The checklist** scores each trade 0–100 on the boxes that *applied* (a box marked n/a is removed from the total, not counted as a miss). Phase 3 — price returned to the FVG, inversion candle closed through it — is the trigger; without both there is no valid entry. Grades: A+ ≥ 90, A ≥ 80, B ≥ 70, C ≥ 50, F below. 70 is my minimum.');
  p('- **Adherence** is derived, never self-reported: a trade followed the rules if the trigger fired, 70% or more of the applicable boxes were ticked, and no mistake was tagged. "Said I followed the rules" is my own answer, kept separately so the gap can be measured.');
  p('- **Graded after the fact** means the trade was logged in one pass after the outcome was known; its grade is less trustworthy than one given before.');
  p('- Every trade has a reference like `T-1a2b3c4d`. Charts are attached as files named `charts/<date>_<time>_<ref>.png` — the name tells you which trade each image belongs to.');
  p('');
  p('**What I want from this review**');
  p('1. What I did well this month — specifically, with trade references, so I can repeat it.');
  p('2. Where I broke my own rules, how often, and what it cost in R. Which checklist boxes do I skip most?');
  p('3. What my losing trades have in common (setup, session, time, grade, the morning I had, what I wrote before entering).');
  p('4. My hesitation: what the missed trades say about when and why I freeze.');
  p('5. Whether my lessons are repeating — am I writing the same lesson and not acting on it?');
  p('6. One to three concrete changes for next month, stated as rules I can check on a single trade, not general advice.');
  p('');
  p('Be direct. Quote my own words back to me where they matter. Say when a sample is too small to conclude anything (under ~20 trades), and do not give generic trading advice that ignores the data.');

  /* ------------------------------------------------------------- numbers */
  h('## The month in numbers');
  if (accounts.length === 0) {
    p('_No real trades this month._');
  } else {
    p(table(
      ['Account', 'Taken', 'Passed', 'Win rate', 'Net R', 'Expectancy', 'Profit factor', 'Net $', 'Adherence', 'Best', 'Worst'],
      accounts.map((acc) => {
        const { a, e, m, d } = numbers(real.filter((t) => t.account === acc));
        return [acc, a.taken, a.passed, pct(a.winRate), r1(a.totalR), r2(e.expectancy),
          e.profitFactor == null ? '—' : e.profitFactor.toFixed(2), m.priced ? usd(m.net) : '—',
          pct(d.adherenceRate), r1(e.bestR), r1(e.worstR)];
      }),
    ));
    const prevAccounts = accounts.filter((acc) => prevReal.some((t) => t.account === acc));
    if (prevAccounts.length) {
      h(`### Against ${MONTHS[Number(prev.slice(5, 7)) - 1]}`);
      p(table(['Account', 'Taken (then → now)', 'Win rate', 'Net R', 'Adherence'], prevAccounts.map((acc) => {
        const was = numbers(prevReal.filter((t) => t.account === acc));
        const is = numbers(real.filter((t) => t.account === acc));
        return [acc, `${was.a.taken} → ${is.a.taken}`, `${pct(was.a.winRate)} → ${pct(is.a.winRate)}`,
          `${r1(was.a.totalR)} → ${r1(is.a.totalR)}`, `${pct(was.d.adherenceRate)} → ${pct(is.d.adherenceRate)}`];
      })));
    }

    /*
      Per account, never pooled: a backtest's R and a live account's R are
      not the same R, and a "followed the rules: +9R" that is mostly replay
      trades would send the review after the wrong problem.
    */
    for (const acc of accounts) {
      const scoped = real.filter((t) => t.account === acc);
      const taken = scoped.filter((t) => isTaken(t.outcome));
      const d = discipline(scoped);
      h(accounts.length > 1 ? `## ${acc}: following the rules` : '## Following the rules');
      p(`- Followed: **${d.followed.taken}** trade${d.followed.taken === 1 ? '' : 's'}, ${r1(d.followed.totalR)}`);
      p(`- Broke a rule: **${d.broken.taken}** trade${d.broken.taken === 1 ? '' : 's'}, ${r1(d.broken.totalR)}`);
      if (d.unscored.taken) p(`- Checklist left blank: ${d.unscored.taken}, ${r1(d.unscored.totalR)}`);
      if (d.untriggered.taken) p(`- Taken without the Phase 3 trigger: ${d.untriggered.taken}, ${r1(d.untriggered.totalR)}`);
      if (d.gap.answered) {
        p(`- Said I followed every rule when the checklist disagreed: ${d.gap.overclaimed} of ${d.gap.answered} answered`);
      }

      const boxes = CHECKLIST_ITEMS.map((item) => {
        const applied = taken.filter((t) => t[item.key] != null);
        const skipped = applied.filter((t) => t[item.key] === false);
        return { item, applied: applied.length, skipped: skipped.length, r: skipped.reduce((sum, t) => sum + (t.r_multiple ?? 0), 0) };
      }).filter((x) => x.skipped > 0).sort((x, y) => y.skipped - x.skipped);
      h('### Checklist boxes left unticked, most often first');
      p(table(['Box', 'Unticked', 'R on those trades'],
        boxes.map((x) => [`${x.item.label} (${x.item.points} pts)`, `${x.skipped} of ${x.applied}`, r1(x.r)])));

      // The gates, tested on this month: does the model's own line pay?
      const gates = modelBreakdowns(taken, taken);
      const gateRows = [
        ...gates.sweepTier.map((row) => [`Sweep: ${row.label}`, row.stats.taken, pct(row.stats.winRate), r1(row.stats.totalR)]),
        ...gates.singularGap.map((row) => [`Gap: ${row.label}`, row.stats.taken, pct(row.stats.winRate), r1(row.stats.totalR)]),
      ].filter((row) => (row[1] as number) > 0);
      if (gateRows.length) {
        h('### The gates: sweep tier and singular gap');
        p(table(['Answer', 'Trades', 'Win rate', 'R'], gateRows));
      }

      const tags = new Map<string, Trade[]>();
      for (const t of taken) for (const tag of t.mistake_tags) tags.set(tag, [...(tags.get(tag) ?? []), t]);
      const worked = new Map<string, Trade[]>();
      for (const t of taken) for (const tag of t.worked_tags ?? []) worked.set(tag, [...(worked.get(tag) ?? []), t]);
      if (worked.size) {
        h('### What worked, as I tagged it');
        p(table(['What worked', 'Trades', 'R'], [...worked.entries()].sort((x, y) => y[1].length - x[1].length)
          .map(([tag, list]) => [tag, list.length, r1(list.reduce((sum, t) => sum + (t.r_multiple ?? 0), 0))])));
      }
      if (tags.size) {
        h('### Mistakes I tagged');
        p(table(['Mistake', 'Trades', 'R'], [...tags.entries()].sort((x, y) => y[1].length - x[1].length)
          .map(([tag, list]) => [tag, list.length, r1(list.reduce((sum, t) => sum + (t.r_multiple ?? 0), 0))])));
      }

      h(accounts.length > 1 ? `## ${acc}: where the R came from` : '## Where the R came from');
      p('Worst first.');
      for (const [name, keyOf] of [
        ['Grade at entry', (t: Trade) => t.grade_letter],
        ['Setup', (t: Trade) => t.setup_type],
        ['Session', (t: Trade) => t.session],
        ['Why I took it', (t: Trade) => t.reason],
        ['Higher-timeframe bias', (t: Trade) => t.htf_bias],
        ['Direction', (t: Trade) => t.direction],
      ] as Array<[string, (t: Trade) => string]>) {
        h(`### ${name}`);
        p(table([name, 'Taken', 'Win rate', 'Net R', 'Avg R'], groupRows(scoped, keyOf)));
      }
    }
  }

  /* ------------------------------------------------------------ mornings */
  const monthReviews = reviews.filter((r) => inMonth(r.day)).sort((a, b) => a.day.localeCompare(b.day));
  h('## My mornings');
  if (monthReviews.length === 0) {
    p('_No daily reviews written this month._');
  } else {
    p(table(
      ['Day', 'Checked in', 'Slept', 'Mind (1–5)', 'Bias', 'News', 'Max trades', 'Taken', 'Day R', 'Bias held', 'What happened'],
      monthReviews.map((r) => {
        const day = real.filter((t) => t.date.slice(0, 10) === r.day && isTaken(t.outcome));
        const checked = r.checked_in_at
          ? new Date(r.checked_in_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
          : 'no';
        return [r.day, checked, r.sleep_hours == null ? null : `${r.sleep_hours}h`, r.state_of_mind,
          [r.bias_direction, r.bias].filter(Boolean).join(' — '),
          r.news ? `${r.news}${r.news_note ? ` (${r.news_note})` : ''}` : null,
          r.trades_planned, day.length, day.length ? r1(day.reduce((s, t) => s + (t.r_multiple ?? 0), 0)) : null,
          r.bias_held == null ? null : r.bias_held ? 'yes' : 'no', r.what_happened];
      }),
    ));
    const over = monthReviews.filter((r) => r.trades_planned != null
      && real.filter((t) => t.date.slice(0, 10) === r.day && isTaken(t.outcome)).length > r.trades_planned);
    if (over.length) p(`\nTook more trades than planned on ${over.length} day${over.length === 1 ? '' : 's'}: ${over.map((r) => r.day).join(', ')}.`);
  }
  const findings = conditions(reviews, trades.filter((t) => !isHypothetical(t.account))).factors
    .map((f) => f.finding).filter(Boolean);
  if (findings.length) {
    h('### What my mornings say, across every review ever written');
    for (const f of findings) p(`- ${f}`);
  }

  /* ---------------------------------------------------------- chart prep */
  const monthPreps = (input.preps ?? []).filter((pr) => inMonth(pr.day)).sort((a, b) => a.day.localeCompare(b.day));
  if (monthPreps.length) {
    h('## My chart prep, day by day');
    p('_Levels and plans marked on the chart before New York. Worth checking against what each day then did: did price go to the target, did the trades follow a plan?_');
    for (const pr of monthPreps) {
      const day = real.filter((t) => t.date.slice(0, 10) === pr.day && isTaken(t.outcome));
      h(`### ${pr.day}${day.length ? ` — ${day.length} trade${day.length === 1 ? '' : 's'}, ${r1(day.reduce((s, t) => s + (t.r_multiple ?? 0), 0))}` : ' — no trades'}`);
      p(prepMarkdown(pr));
    }
  }

  /* ---------------------------------------------------------- hesitation */
  h('## Hesitation');
  if (missed.length === 0) {
    p('_No missed trades logged this month._');
  } else {
    const wouldR = missed.reduce((s, t) => s + (t.r_multiple ?? 0), 0);
    p(`${missed.length} setup${missed.length === 1 ? '' : 's'} missed this month. Taken, they would have made **${r1(wouldR)}** (${plural(missed.filter((t) => (t.r_multiple ?? 0) > 0).length, 'winner')}, ${plural(missed.filter((t) => (t.r_multiple ?? 0) < 0).length, 'loser')}).`);
    const why = new Map<string, number>();
    for (const t of missed) why.set(t.skip_reason ?? 'Not said', (why.get(t.skip_reason ?? 'Not said') ?? 0) + 1);
    p(`Why: ${[...why.entries()].map(([k, n]) => `${k} ${n}`).join(' · ')}.`);
  }
  const patterns = missedPatterns(trades, reviews);
  if (patterns.findings.length) {
    h('### Patterns across every missed trade ever logged');
    p(`Usual miss rate: ${pct(patterns.rate)} (${patterns.missed} missed, ${patterns.taken} taken).`);
    for (const f of patterns.findings) p(`- ${f}`);
  }

  /* -------------------------------------------------------------- trades */
  const charts: MonthlyChart[] = [];
  h('## Every trade');
  p('Oldest first. Missed trades are marked; their R is what they would have made.');
  for (const t of monthTrades) {
    const pnl = pnlOf(t);
    const verdict = adherenceOf(t);
    const outcome = t.outcome === 'Not taken' ? 'Passed' : `${t.outcome} ${r1(t.r_multiple)}${pnl != null && !isHypothetical(t.account) ? ` (${usd(pnl)})` : ''}`;
    h(`### ${when(t)} · ${t.account}${isHypothetical(t.account) ? (countsInStats(t) ? ' (would have, written before)' : ' (would have — Hindsight, not counted)') : ''} · ${t.instrument} ${t.direction} · ${outcome} · \`${ref(t)}\``);
    p(`- **Setup:** ${t.setup_type} · ${t.session} · HTF ${t.htf_bias.toLowerCase()} · ${t.premium_discount} · target ${t.target_type}`);
    p(`- **Why I took it:** ${t.reason}${isHypothetical(t.account) && t.skip_reason ? ` · **why I didn't:** ${t.skip_reason}` : ''}`);
    p(`- **Grade:** ${t.checklist_score} (${t.grade_letter})${t.grade_at_entry != null && t.grade_at_entry !== t.checklist_score ? `, ${t.grade_at_entry} at entry` : ''} · trigger ${t.trigger_fired ? 'fired' : '**did not fire**'} · rules ${verdict === 'followed' ? 'followed' : verdict === 'broken' ? '**broken**' : 'not scored'}${t.followed_rules != null ? ` (I said ${t.followed_rules ? 'followed' : 'broken'})` : ''}${t.graded_post_hoc ? ' · graded after the fact' : ''}${t.regrade ? ` · re-graded ${t.regrade}` : ''}`);
    p(`- **Checklist:** sweep ${t.sweep_tier ? SWEEP_TIER_SPEC[t.sweep_tier].label : 'not recorded'} · ${CHECKLIST_ITEMS.map((i) => `${t[i.key] === true ? '✓' : t[i.key] === false ? '✗' : i.gate ? '?' : 'n/a'} ${i.label}`).join(' · ')}`);
    const context = CONTEXT_FLAG_LIST.filter((f) => (t as unknown as Record<string, unknown>)[f.key] === true).map((f) => f.label);
    if (context.length) p(`- **Context present:** ${context.join(', ')}`);
    if (t.mistake_tags.length) p(`- **Mistakes tagged:** ${t.mistake_tags.join(', ')}`);
    if (t.worked_tags?.length) p(`- **What worked:** ${t.worked_tags.join(', ')}`);
    if (t.market_tags?.length) p(`- **What the market did (outside my control):** ${t.market_tags.join(', ')}`);
    {
      const g: string[] = [];
      if (t.chart_date) g.push(`replayed session ${t.chart_date}`);
      if (t.grade_locked_at) g.push(`grade locked ${t.graded_post_hoc ? 'after' : '**before**'} the outcome`);
      if (t.confidence_at_entry != null) g.push(`confidence ${t.confidence_at_entry}/5${t.below_min_confidence ? ' (**below my minimum**)' : ''}`);
      if (t.be_trigger) g.push(`BE trigger ${t.be_trigger}`);
      if (g.length) p(`- **Guardrails:** ${g.join(' · ')}`);
      const tc: string[] = [];
      if (t.nearest_liquidity_type) tc.push(`nearest ${t.nearest_liquidity_type}${t.nearest_liquidity_price != null ? ` @ ${t.nearest_liquidity_price}` : ''}`);
      if (t.opposing_swings_between) tc.push(`${t.opposing_swings_between} opposing swings`);
      if (t.r_to_nearest != null) tc.push(`${t.r_to_nearest}R to nearest`);
      if (t.eqhl_checks) tc.push(`EQH/EQL: ${t.eqhl_checks.touches ? '2+ touches' : 'not 2 touches'}, ${t.eqhl_checks.untested ? 'untested' : 'tested'}, ${t.eqhl_checks.in_range ? 'in range' : 'out of range'}`);
      if (tc.length || t.target_check_passed != null) p(`- **Target check:** ${tc.join(' · ')}${t.target_check_passed == null ? '' : t.target_check_passed ? ' — passed' : ' — **failed**'}`);
    }
    for (const o of t.overrides ?? []) {
      p(`- **Logged past ${o.kind === 'daily_limit' ? 'the daily loss limit' : `a commitment: "${o.commitment_text ?? ''}"`}**${o.step_title ? ` (${o.step_title})` : ''} — ${o.reason ? `my reason: ${o.reason}` : '_no reason given_'}`);
    }
    if (t.quick_log) p('- **Quick log:** saved fast, past the form\'s minimums — the writing may be thin.');
    const exec = [
      t.contracts != null && `${t.contracts} contract${t.contracts === 1 ? '' : 's'}`,
      t.risk_dollars != null && `risk ${usd(t.risk_dollars)}`,
      t.stop_points != null && `stop ${t.stop_points} pts`,
      t.confidence_at_entry != null && `confidence ${t.confidence_at_entry}/5`,
      t.mae_r != null && `MAE ${r2(t.mae_r)}`,
      t.mfe_r != null && `MFE ${r2(t.mfe_r)}`,
      t.reached_1r != null && (t.reached_1r ? 'reached +1R first' : 'never reached +1R'),
    ].filter(Boolean);
    if (exec.length) p(`- **Execution:** ${exec.join(' · ')}`);
    if (t.outcome === 'Not taken') {
      p(`- **Passed:** would it have hit TP? ${t.would_have_hit_tp == null ? 'not checked' : t.would_have_hit_tp ? 'yes' : 'no'}${t.skip_reason ? ` · real reason: ${t.skip_reason}` : ''}${t.r_left_on_table != null ? ` · R left: ${r1(t.r_left_on_table)}` : ''}`);
    }
    const flags = openFlagsFor(t);
    if (flags.length) p(`- **Inconsistencies the app flagged:** ${flags.map((f) => f.label).join('; ')}`);

    const stem = `charts/${t.date.slice(0, 10)}_${t.date.slice(11, 16).replace(':', '')}_${ref(t)}`;
    const names: string[] = [];
    if (t.screenshot_path) {
      charts.push({ name: `${stem}${ext(t.screenshot_path)}`, source: t.screenshot_path });
      names.push(`${stem}${ext(t.screenshot_path)}`);
    }
    (shots.get(t.id) ?? []).forEach((s, i) => {
      const name = `${stem}_${i + 2}-${s.slot.toLowerCase().replace(/[^a-z]+/g, '-')}${ext(s.path)}`;
      charts.push({ name, source: s.path });
      names.push(name);
    });
    if (names.length) p(`- **Chart${names.length > 1 ? 's' : ''}:** ${names.map((n) => `\`${n}\``).join(', ')}`);
    p('');
    p(`**What I wrote:** ${t.explanation.trim() || '_nothing_'}`);
    if (t.lesson?.trim()) { p(''); p(`**Lesson:** ${t.lesson.trim()}`); }
  }
  if (monthTrades.length === 0) p('_No trades this month._');

  /* ------------------------------------------------------------- lessons */
  const groups = repeatedLessons(trades).filter((g) => g.lessons.some((l) => inMonth(l.date)));
  h('## Lessons I keep writing');
  if (groups.length === 0) {
    p('_None of this month\'s lessons repeat an earlier one._');
  } else {
    p('Lessons that share enough words to be the same lesson written again, from any month, where at least one is from this month.');
    for (const g of groups) {
      h(`### "${g.shared.slice(0, 5).join(', ')}" — ${g.lessons.length} times, ${r1(g.totalR)}`);
      for (const l of g.lessons) p(`- ${l.date.slice(0, 10)} (${l.outcome}${l.r_multiple != null ? ` ${r1(l.r_multiple)}` : ''}): ${cell(l.lesson)}`);
    }
  }

  /* ---------------------------------------------------------------- path */
  const monthEvents = (input.pathEvents ?? []).filter((e) => inMonth(e.at.slice(0, 10)));
  if (monthEvents.length) {
    h('## The Path this month');
    for (const e of [...monthEvents].sort((a, b) => a.at.localeCompare(b.at))) {
      if (e.kind === 'step_done') p(`- ${e.at.slice(0, 10)} · **Finished:** ${e.step_title ?? 'a step'}`);
      else p(`- ${e.at.slice(0, 10)} · **Broke ${e.kind === 'daily_limit' ? 'the daily loss limit' : `"${e.commitment_text ?? 'a commitment'}"`}**${e.step_title ? ` (${e.step_title})` : ''} — ${e.reason ? `reason: ${e.reason}` : '_no reason given_'}`);
    }
  }

  /* ------------------------------------------------- weekly, pages, cash */
  const weeks = weekly.filter((w) => inMonth(w.week_start) && w.summary?.trim());
  if (weeks.length) {
    h('## Weekly reviews');
    for (const w of weeks) { h(`### Week of ${w.week_start}`); p(w.summary!.trim()); }
  }
  const monthPages = pages.filter((pg) => inMonth(pg.day)).sort((a, b) => a.day.localeCompare(b.day));
  if (monthPages.length) {
    h('## Journal pages');
    for (const pg of monthPages) { h(`### ${pg.day} — ${pg.title || 'Untitled'}`); p(pg.plain.trim() || '_Empty page._'); }
  }
  const moves = cash.filter((c) => inMonth(c.date) && !isHypothetical(c.account));
  if (moves.length) {
    h('## Money in and out');
    p(table(['Date', 'Account', 'Kind', 'Amount', 'Note'], moves.map((c) => [c.date.slice(0, 10), c.account, c.kind, usd(c.amount), c.note])));
  }

  return {
    filename: `signature-review-${month}`,
    markdown: `${out.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`,
    charts,
    tradeCount: monthTrades.length,
  };
}
