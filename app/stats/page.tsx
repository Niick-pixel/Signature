import { cookies } from 'next/headers';
import { wordMap } from '@/lib/wordPatterns';
import { analysable } from '@/lib/analytics';
import { listTrades } from '@/db/trades';
import { accountCookie } from '@/lib/account-pref';
import { countsInStats, isBacktest, isDated, isHypothetical, isReal, isSeparate } from '@/lib/domain';
import { accountsInUse, aggregate, deliveryOnlyVerdict, equityCurves, pnlOf, preGradedOnly } from '@/lib/stats';
import { reviewInputs } from '@/db/review';
import { dayBreaksByTrade, fieldEras, planBreaks } from '@/lib/review';
import { edgeMetrics } from '@/lib/edge/metrics';
import { EdgeHero } from '@/components/stats/EdgeHero';
import { getPrep } from '@/db/prep';
import { planDay, planMatch } from '@/lib/planMatch';
import { successSystem } from '@/lib/successSystem';
import { Ledger, SuccessCard, WordsTable } from '@/components/stats/SuccessView';
import { EquityChart } from '@/components/stats/EquityChart';
import { HypotheticalNote } from '@/components/money/MissedCard';
import { StatsFilters } from '@/components/stats/StatsFilters';
import { accountParam, applyStatsScope, mixesWorlds, parseStatsScope } from '@/lib/statsScope';
import { Panel } from '@/components/stats/Bars';
import { TitleBar } from '@/components/shell/TitleBar';
import { MissedPatternsView } from '@/components/stats/MissedPatterns';
import { TRIAL_RUBRIC, TRIAL_SAMPLE } from '@/lib/rubric';
import { missedPatterns } from '@/lib/missed';
import { listDailyReviews } from '@/db/reviews';
import { BacktestNote } from '@/components/money/BacktestCard';

export const dynamic = 'force-dynamic';

const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`);
// A typographic minus, not a hyphen — it matches the digit width, so a column
// of R values lines up instead of stepping in and out by a pixel.
const signed = (v: number, dp: number) => `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(dp)}R`;
const r2 = (v: number | null) => (v == null ? '—' : signed(v, 2));
/*
  To the cent, always.

  These were rounded to whole dollars, which is fine for a headline and wrong
  for a journal: a $412.37 loss is not a $412 loss, and the difference compounds
  quietly across a month. What the account did is a fact, and a fact reported to
  the nearest dollar is a rounded fact.
*/
const usd = (v: number) =>
  `${v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString(undefined, {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;

export default async function StatsPage(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> },
) {
  // Hindsight — a Missed trade not written down before the move — never
  // enters a number (lib/domain countsInStats). Counted, and said, below.
  const everything = listTrades();
  const all = everything.filter(countsInStats);
  const hindsight = everything.length - all.length;
  const accounts = accountsInUse(everything);

  // Accounts, period, session and direction, from the URL (lib/statsScope).
  // With no account asked for, the remembered choice; with none, the busiest
  // real account. "All accounts" is every account, Backtest and Missed too.
  const params = await searchParams;
  const scope = parseStatsScope(params, accounts.map((a) => a.account), (await cookies()).get(accountCookie('stats'))?.value);
  const single = scope.accounts.length === 1 ? scope.accounts[0] : null;
  // The URL value for this selection, carried by every link on the page.
  const account = accountParam(scope.accounts, accounts.map((a) => a.account));
  const inAccounts = all.filter((t) => scope.accounts.includes(t.account));
  const scoped = applyStatsScope(all, scope);
  const undatedOut = scope.period !== 'all' ? inAccounts.filter((t) => !isDated(t)).length : 0;
  // Every filter but the account, carried by the page's own links.
  const filterParams = {
    ...(scope.period !== 'all' ? { period: scope.period } : {}),
    ...(scope.sessions.length ? { session: scope.sessions.join(',') } : {}),
    ...(scope.directions.length ? { dir: scope.directions.join(',') } : {}),
    ...(scope.rubrics.length ? { rubric: scope.rubrics.join(',') } : {}),
    ...(scope.from ? { from: scope.from } : {}),
    ...(scope.to ? { to: scope.to } : {}),
  };

  /*
    Hindsight-graded and pre-graded trades cannot be pooled without lying to
    myself: a grade given after I already knew the result is not evidence that
    the grading works. ?pregraded=1 drops everything logged in one shot.
  */
  const preOnly = params.pregraded === '1';
  // Quick logs skipped the form's standard, so they can be left out — they
  // are in by default, because a trade that happened is a trade that happened.
  const noQuick = params.quick === '0';
  const quickCount = scoped.filter((t) => t.quick_log).length;
  const trades = (preOnly ? preGradedOnly(scoped) : scoped).filter((t) => !noQuick || !t.quick_log);
  // The trial counts the skipped setups logged in Missed as well — on any
  // account's page, not only on Missed's (where they are already the selection).
  const sameFilters = (list: typeof all) => (preOnly ? preGradedOnly(list) : list).filter((t) => !noQuick || !t.quick_log);
  const trialVerdict = deliveryOnlyVerdict(sameFilters(trades),
    // Not on Backtest's page: a replay's verdict is its own.
    single && isSeparate(single) ? [] : sameFilters(all.filter((t) => isHypothetical(t.account))));
  const agg = aggregate(trades);
  const pageQuery = new URLSearchParams({ account, ...filterParams }).toString();

  // One definition of adherence: nothing broken in the rule book, trade and day rules (lib/review planBreaks).
  const { trades: allTrades, ctxFor, cfg } = reviewInputs();
  const breaks = dayBreaksByTrade(allTrades, ctxFor, cfg);
  const eras = fieldEras(allTrades);
  const curves = equityCurves(trades, (t) => planBreaks(t, breaks, cfg, eras).length === 0);
  // The canonical metrics (lib/edge/metrics), over settled trades in the order they happened.
  const settled = trades.filter((t) => t.outcome !== 'Not taken' && t.r_multiple != null).sort((a, b) => a.date.localeCompare(b.date));
  const metrics = edgeMetrics(settled.map((t) => ({ r: t.r_multiple as number, money: pnlOf(t) })));
  const scopeLabel = scope.all ? 'all accounts' : scope.accounts.map((a) => (isBacktest(a) ? 'Backtest' : a)).join(' + ');
  const preps = new Map<string, ReturnType<typeof getPrep>>();
  const prepOf = (day: string) => { if (!preps.has(day)) preps.set(day, getPrep(day)); return preps.get(day) ?? null; };
  const success = successSystem(analysable(trades), {
    plan: (t) => { if (t.undated || isBacktest(t.account)) return null; const st = planMatch(t, prepOf(planDay(t))?.data ?? null).status; return st === 'in' || st === 'off' ? st : null; },
    broken: (t) => planBreaks(t, breaks, cfg, eras).map((b) => b.short),
  });
  // Your words (lib/wordPatterns): the writing goes along only for the trades behind the words shown.
  const words = wordMap(analysable(trades), { minN: 3 });
  const shownIds = new Set(words.words.flatMap((w) => w.tradeIds.slice(0, 8)));
  const wordTrades = trades.filter((t) => shownIds.has(t.id)).map((t) => ({ id: t.id, date: t.date, r: t.r_multiple, setup: t.setup_type, text: `${t.lesson ?? ''}\n${t.explanation ?? ''}` }));
  const trial = TRIAL_RUBRIC != null ? trialVerdict : null;

  const toggle = (on: boolean, key: 'pregraded' | 'quick') => `/stats?${new URLSearchParams({
    account, ...filterParams,
    ...(key === 'pregraded' ? (on ? {} : { pregraded: '1' }) : (preOnly ? { pregraded: '1' } : {})),
    ...(key === 'quick' ? (on ? {} : { quick: '0' }) : (noQuick ? { quick: '0' } : {})),
  })}`;
  const pill = (on: boolean) => ({
    borderColor: on ? 'rgb(var(--accent) / 0.55)' : 'var(--glass-stroke)',
    background: on ? 'rgb(var(--accent) / 0.12)' : 'var(--glass-fill)',
    color: on ? 'rgb(var(--accent))' : 'var(--text-dim)',
  });

  return (
    <div className="flex h-dvh flex-col">
      <TitleBar />
      <div className="signature-enter min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[68rem] px-6 pb-20 pt-4">
          <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-[22px] font-semibold tracking-tight">Stats</h1>
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <a href={toggle(preOnly, 'pregraded')} className="rounded-full border px-3 py-1 font-medium" style={pill(preOnly)} title="Only trades graded before the outcome was known">Pre-graded only</a>
              {quickCount > 0 && <a href={toggle(noQuick, 'quick')} className="rounded-full border px-3 py-1 font-medium" style={pill(noQuick)} title="Leave out trades saved with Log it fast">No quick logs</a>}
              <a href="/reports" className="rounded-full border px-3 py-1 font-medium" style={pill(false)} title="Compare, breakdowns, fees, the rules heatmap, your tags (R)">Reports →</a>
              <a href="/analytics" className="rounded-full border px-3 py-1 font-medium" style={pill(false)} title="Time, confluences, psychology, mistake cost, what if, tilt, news (A)" data-analytics-link>Analytics →</a>
            </div>
          </header>

          <div className="mb-5"><StatsFilters available={accounts} scope={scope}
            rubrics={[...new Set(everything.map((t) => t.rubric_version))].sort((a, b) => a - b)} /></div>

          {mixesWorlds(scope.accounts) && (
            <p data-mixed-note className="mb-4 text-[12px]" style={{ color: 'rgb(var(--amber))' }}>
              Mixed: {scope.accounts.filter((a) => !isReal(a)).map((a) => isBacktest(a) ? 'backtests' : 'missed setups').join(' and ')} are counted with real trades here.
            </p>
          )}
          {(hindsight > 0 && (single == null || isHypothetical(single) || scope.all)) || undatedOut > 0 ? (
            <p className="mb-4 text-[11.5px]" style={{ color: 'var(--text-faint)' }} data-hindsight-note>
              {hindsight > 0 && (single == null || isHypothetical(single) || scope.all) ? `${hindsight} hindsight missed trade${hindsight === 1 ? '' : 's'} left out. ` : ''}
              {undatedOut > 0 ? `${undatedOut} undated backtest${undatedOut === 1 ? '' : 's'} left out of the period.` : ''}
            </p>
          ) : null}

          {single && isBacktest(single) && <div className="mb-5"><BacktestNote undated={scoped.filter((t) => !isDated(t)).length} where="stats" /></div>}
          {single && isHypothetical(single) && (
            <div className="mb-5 space-y-5">
              <HypotheticalNote />
              <Panel n={(() => { const x = missedPatterns(all, listDailyReviews()); return x.missed + x.taken; })()} title="Where you hesitate"
                note="Of the setups you saw under each condition, how many went without you.">
                <MissedPatternsView data={missedPatterns(all, listDailyReviews())} />
              </Panel>
            </div>
          )}

          {trades.length === 0 ? (
            <div className="glass rounded-[calc(24px*var(--rk))] p-8 text-center text-[13px]" style={{ color: 'var(--text-dim)' }}>Nothing to measure yet.</div>
          ) : (
            <div className="space-y-5">
              <EdgeHero m={metrics} scopeLabel={scopeLabel} />

              <section className="glass rounded-[calc(20px*var(--rk))] px-5 py-4" data-card>
                <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>Equity, trade by trade</h2>
                <EquityChart all={curves.all} followed={curves.followed} broken={curves.broken} />
              </section>

              <SuccessCard s={success} />
              <WordsTable map={words} trades={wordTrades} />
              <Ledger s={success} query={pageQuery} />

              <p className="pt-1 text-center text-[11px]" style={{ color: 'var(--text-faint)' }}>
                {preOnly ? `Only trades graded before the outcome — ${trades.length} of ${scoped.length}. ` : ''}
                {agg.passed > 0 ? `${agg.passed} passed setup${agg.passed === 1 ? '' : 's'} journalled, never counted. ` : ''}
                {trial ? `Rubric ${TRIAL_RUBRIC} trial: ${trial.n}/${TRIAL_SAMPLE} setups${trial.avgR != null ? `, ${signed(trial.avgR, 2)} avg` : ''}${trial.ready ? (trial.positive ? ' — verdict: promote.' : ' — verdict: drop.') : '.'}` : ''}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

