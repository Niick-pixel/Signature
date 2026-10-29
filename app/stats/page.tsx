import { cookies } from 'next/headers';
import { WordMapCard } from '@/components/stats/WordMap';
import { wordMap } from '@/lib/wordPatterns';
import { analysable } from '@/lib/analytics';
import { listTrades } from '@/db/trades';
import { accountCookie } from '@/lib/account-pref';
import { ACCOUNT_VALUES, MIN_SAMPLE, REASON_HUE, countsInStats, isBacktest, isDated, isHypothetical, isReal, isSeparate, type Account } from '@/lib/domain';
import { reasonAccent } from '@/lib/layout';
import {
  accountsInUse, aggregate, deliveryOnlyVerdict, edge, equityCurves, money, preGradedOnly, rByReason,
} from '@/lib/stats';
import { analyse } from '@/lib/insights';
import { gradePredictors, managementLab, targetScorecard } from '@/lib/lab';
import { Lab } from '@/components/stats/Lab';
import { trends } from '@/lib/review';
import { reviewInputs } from '@/db/review';
import { Learn, WhyYouWin } from '@/components/stats/Learn';
import { EquityChart } from '@/components/stats/EquityChart';
import { HypotheticalNote } from '@/components/money/MissedCard';
import { StatsFilters } from '@/components/stats/StatsFilters';
import { accountParam, applyStatsScope, mixesWorlds, parseStatsScope } from '@/lib/statsScope';
import { Panel, SignedBars, Stat, type BarRow } from '@/components/stats/Bars';
import { edgeRead, meanRange, winRateRange } from '@/lib/confidence';
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
const r = (v: number | null) => (v == null ? '—' : signed(v, 1));
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
  const m = money(trades);
  const e = edge(trades);
  const taken = trades.filter((t) => t.outcome !== 'Not taken');
  const withR = taken.filter((t) => t.r_multiple != null);
  // 95% ranges: the same numbers, honest about how few trades sit behind them.
  const wrRange = winRateRange(agg.wins, agg.wins + agg.losses);
  const expRange = meanRange(withR.map((t) => t.r_multiple as number));
  const expRead = edgeRead(expRange);
  /*
    The R chart has its own filters (c_account, c_session, …), starting from
    the page's: once any is set, the chart shows its own selection — another
    account, another session — without changing anything else on the page.
  */
  const chartKeys = Object.keys(params).filter((k) => k.startsWith('c_'));
  const chartScope = chartKeys.length
    ? parseStatsScope({
        account: params.c_account ?? account,
        period: params.c_period ?? scope.period,
        session: params.c_session ?? (scope.sessions.join(',') || undefined),
        dir: params.c_dir ?? (scope.directions.join(',') || undefined),
        rubric: params.c_rubric ?? (scope.rubrics.join(',') || undefined),
        from: params.c_from ?? scope.from ?? undefined,
        to: params.c_to ?? scope.to ?? undefined,
      }, accounts.map((a) => a.account))
    : scope;
  const chartTrades = chartKeys.length
    ? (preOnly ? preGradedOnly(applyStatsScope(all, chartScope)) : applyStatsScope(all, chartScope)).filter((t) => !noQuick || !t.quick_log)
    : trades;
  const curves = equityCurves(chartTrades);
  const chartTaken = chartTrades.filter((t) => t.outcome !== 'Not taken');
  // The review engine: my rules, last 10 against the 10 before, and grade honesty.
  const review = (() => { const { ctxFor, cfg } = reviewInputs(); return trends(trades, ctxFor, cfg); })();
  const preGraded = taken.filter((t) => !t.graded_post_hoc).length;
  // The page's filters, for the "see the trades" links (app/stats/trades).
  const pageQuery = new URLSearchParams({ account, ...filterParams }).toString();
  // What my own writing says keeps going wrong (lib/insights).
  const insights = analyse(trades);
  // Your words, measured (lib/wordPatterns): the taken trades with an R; the writing goes along only for the words shown.
  const words = wordMap(analysable(trades), { minN: 3 });
  const shownIds = new Set(words.words.flatMap((w) => w.tradeIds.slice(0, 6)));
  const wordTrades = trades.filter((t) => shownIds.has(t.id)).map((t) => ({ id: t.id, date: t.date, r: t.r_multiple, setup: t.setup_type, text: `${t.lesson ?? ''}\n${t.explanation ?? ''}` }));
  const reasonRows: BarRow[] = rByReason(trades).map((g) => ({
    label: g.key, value: g.stats.totalR, display: r(g.stats.totalR),
    meta: `· ${g.stats.count}`, swatch: reasonAccent(g.key),
  }));

  return (
    <div className="flex h-dvh flex-col">
      <TitleBar />
      <div className="signature-enter min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[68rem] px-6 pb-20 pt-4">
          <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-[22px] font-semibold tracking-tight">Stats</h1>
            <div className="flex flex-wrap items-center gap-3">
              <a href="/analytics" className="rounded-full border px-3.5 py-1.5 text-[12px] font-medium" data-analytics-link
                style={{ borderColor: 'rgb(var(--accent) / 0.45)', color: 'rgb(var(--accent))', background: 'rgb(var(--accent) / 0.08)' }}
                title="Time of day, confluences that pay, psychology, news, and Ask your journal (A)">
                Analytics →
              </a>

              <a
                href={`/stats?${new URLSearchParams({
                  // Always carried, 'All' included: without it the page falls back to
                  // the remembered account and the filter silently changes accounts.
                  account, ...filterParams,
                  ...(preOnly ? {} : { pregraded: '1' }),
                  ...(noQuick ? { quick: '0' } : {}),
                })}`}
                className="rounded-full border px-3.5 py-1.5 text-[12px] font-medium"
                style={{
                  borderColor: preOnly ? 'rgb(var(--accent) / 0.55)' : 'var(--glass-stroke)',
                  background: preOnly ? 'rgb(var(--accent) / 0.12)' : 'var(--glass-fill)',
                  color: preOnly ? 'rgb(var(--accent))' : 'var(--text-dim)',
                }}
                title="Exclude trades that were logged in one shot after the fact"
              >
                Pre-graded only
              </a>
              {quickCount > 0 && (
                <a
                  href={`/stats?${new URLSearchParams({
                    // Always carried, 'All' included: without it the page falls back to
                  // the remembered account and the filter silently changes accounts.
                  account, ...filterParams,
                    ...(preOnly ? { pregraded: '1' } : {}),
                    ...(noQuick ? {} : { quick: '0' }),
                  })}`}
                  className="rounded-full border px-3.5 py-1.5 text-[12px] font-medium"
                  style={{
                    borderColor: noQuick ? 'rgb(var(--accent) / 0.55)' : 'var(--glass-stroke)',
                    background: noQuick ? 'rgb(var(--accent) / 0.12)' : 'var(--glass-fill)',
                    color: noQuick ? 'rgb(var(--accent))' : 'var(--text-dim)',
                  }}
                  title="Leave out trades saved with Log it fast"
                >
                  Without quick logs · {quickCount}
                </a>
              )}
            </div>
          </header>

          <div className="mb-5"><StatsFilters available={accounts} scope={scope}
            rubrics={[...new Set(everything.map((t) => t.rubric_version))].sort((a, b) => a - b)} /></div>

          {mixesWorlds(scope.accounts) && (
            <p data-mixed-note className="mb-5 rounded-[calc(14px*var(--rk))] px-3.5 py-2.5 text-[12px] leading-relaxed"
              style={{ background: 'rgb(var(--amber) / 0.08)', border: '1px solid rgb(var(--amber) / 0.25)', color: 'rgb(var(--amber))' }}>
              Mixed: real trades are counted together with {scope.accounts.filter((a) => !isReal(a)).map((a) => isBacktest(a) ? 'backtest replays' : 'missed setups').join(' and ')} here.
              Every total below includes them — pick accounts above to see one world at a time.
            </p>
          )}
          {hindsight > 0 && (single == null || isHypothetical(single) || scope.all) && (
            <p className="mb-5 text-[12px]" style={{ color: 'var(--text-faint)' }} data-hindsight-note>
              {hindsight} missed trade{hindsight === 1 ? ' is' : 's are'} <b>Hindsight</b> — not written down before the move — and left out of every number here.
            </p>
          )}
          {undatedOut > 0 && (
            <p className="mb-5 text-[12px]" style={{ color: 'var(--text-faint)' }}>
              {undatedOut} undated backtest{undatedOut === 1 ? ' is' : 's are'} left out: a period needs a day to fall in.
            </p>
          )}

          {single && isBacktest(single) && (
            <div className="mb-5">
              <BacktestNote undated={scoped.filter((t) => !isDated(t)).length} where="stats" />
            </div>
          )}

          {single && isHypothetical(single) && (
            <div className="mb-5 space-y-5">
              <HypotheticalNote />
              {/* Against every trade actually taken — a miss rate needs both sides. */}
              <Panel
                n={single && isHypothetical(single) ? (() => { const x = missedPatterns(all, listDailyReviews()); return x.missed + x.taken; })() : undefined}
                title="Where you hesitate"
                note="Of the setups you saw under each condition, how many went without you — missed here, set against the trades you took in Demo, Live and Funded. The tick on each bar is your usual rate; a bar past it is a condition you freeze in. Faded rows have too few setups to mean anything yet."
              >
                <MissedPatternsView data={missedPatterns(all, listDailyReviews())} />
              </Panel>
            </div>
          )}

          {trades.length === 0 ? (
            <div className="glass rounded-[calc(24px*var(--rk))] p-8 text-center text-[13px]" style={{ color: 'var(--text-dim)' }}>
              Nothing to measure yet.
            </div>
          ) : (
            <div className="space-y-8">
              {/*
                The page in three parts, cut down from twenty-five panels to the
                ones that change what I do on Monday: the basics (where I stand
                and the curve), what keeps going wrong in my own words, and why
                I win. Everything else described the record without telling me
                how to improve it.
              */}
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Stat
                    n={agg.taken}
                    label="Net R"
                    value={r(agg.totalR)}
                    sub={`+${e.rWon.toFixed(1)}R won · −${e.rLost.toFixed(1)}R lost`}
                    tone={agg.totalR > 0 ? 'win' : agg.totalR < 0 ? 'loss' : null}
                  />
                  <Stat
                    n={agg.wins + agg.losses}
                    label="Win rate"
                    value={pct(agg.winRate)}
                    sub={`${agg.wins}W · ${agg.losses}L · ${agg.breakeven + agg.scratched} flat`}
                    range={wrRange && `likely ${Math.round(wrRange.lo * 100)}–${Math.round(wrRange.hi * 100)}%`}
                  />
                  <Stat
                    n={withR.length}
                    label="Expectancy"
                    value={r2(e.expectancy)}
                    sub="Average R per trade taken"
                    range={expRange && `likely ${r2(expRange.lo)} to ${r2(expRange.hi)}`}
                    read={expRead && {
                      positive: { text: 'edge looks real', tone: 'win' as const },
                      negative: { text: 'losing, not bad luck', tone: 'loss' as const },
                      unclear: { text: 'not clear yet', tone: null },
                    }[expRead]}
                    tone={(e.expectancy ?? 0) > 0 ? 'win' : (e.expectancy ?? 0) < 0 ? 'loss' : null}
                  />
                  {m.priced ? (
                    <Stat
                      n={m.priced}
                      label="Net P&L"
                      money
                      value={usd(m.net)}
                      sub={`${usd(m.won)} won · ${usd(m.lost)} lost`}
                      tone={m.net > 0 ? 'win' : m.net < 0 ? 'loss' : null}
                    />
                  ) : (
                    <Stat
                      n={withR.length}
                      label="Profit factor"
                      value={e.profitFactor == null ? '—' : e.profitFactor.toFixed(2)}
                      sub={e.profitFactor == null ? 'Needs a win and a loss'
                        : e.profitFactor >= 1 ? 'Winners cover the losers' : 'Losers outweigh the winners'}
                      tone={e.profitFactor == null ? null : e.profitFactor >= 1 ? 'win' : 'loss'}
                    />
                  )}
                </div>
                <Panel
                  n={chartTaken.filter((t) => t.r_multiple != null).length}
                  title="Your R, trade by trade"
                  note={`Cumulative R in the order the trades happened — all of them, then split by whether the checklist says the rules were followed. ${preGraded} of ${taken.length} graded before the outcome. These filters are the chart's own; the rest of the page keeps the ones above.`}
                >
                  <div className="mb-4" data-chart-filters>
                    <StatsFilters available={accounts} scope={chartScope} prefix="c_" overridden={chartKeys.length > 0}
                      rubrics={[...new Set(everything.map((t) => t.rubric_version))].sort((a, b) => a - b)} />
                  </div>
                  <EquityChart all={curves.all} followed={curves.followed} broken={curves.broken} />
                </Panel>
              </div>

              <WordMapCard map={words} trades={wordTrades} />
              <Learn data={insights} review={review} query={pageQuery} />

              <Lab targets={targetScorecard(trades)} lab={managementLab(trades)} grades={gradePredictors(trades)} query={pageQuery} />

              <WhyYouWin data={insights}>
                <Panel n={agg.taken} title="R by reason" note="Why you took each trade, net R, worst first.">
                  <SignedBars rows={reasonRows} />
                </Panel>
              </WhyYouWin>

          {TRIAL_RUBRIC != null && (() => {
            const v = trialVerdict;
            const pct = Math.min(100, Math.round((v.n / TRIAL_SAMPLE) * 100));
            const state = !v.ready ? 'collecting' : v.positive ? 'promote' : 'drop';
            const hue = state === 'promote' ? '--outcome-win' : state === 'drop' ? '--outcome-loss' : '--accent';
            return (
              <section data-trial-card={state} className="glass rounded-[calc(20px*var(--rk))] px-5 py-4"
                style={{ borderColor: `rgb(var(${hue}) / 0.35)` }}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-[14px] font-semibold tracking-tight">Rubric {TRIAL_RUBRIC} trial — does a delivery without a sweep pay?</h2>
                  <span className="tabular-nums text-[12px] font-semibold" style={{ color: `rgb(var(${hue}))` }}>
                    {v.n}/{TRIAL_SAMPLE} setups{v.avgR != null && ` · avg ${v.avgR >= 0 ? '+' : '−'}${Math.abs(v.avgR).toFixed(2)}R`}
                  </span>
                </div>
                <div className="mt-2.5 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--glass-fill-strong)' }}>
                  <div data-trial-progress={pct} className="h-full rounded-full" style={{ width: `${pct}%`, background: `rgb(var(${hue}))` }} />
                </div>
                <p className="mt-2.5 text-[12px] leading-relaxed" style={{ color: 'var(--text-dim)' }}>
                  {state === 'collecting' && <>
                    Collecting. Rubric {TRIAL_RUBRIC} would accept a delivery from an HTF FVG/OB without a sweep (max B). It needs {TRIAL_SAMPLE - v.n} more
                    such setup{TRIAL_SAMPLE - v.n === 1 ? '' : 's'} to judge — taken{v.missed > 0 ? ` (${v.real})` : ''} or logged in Missed{v.missed > 0 ? ` (${v.missed})` : ''},
                    which fills it without risking money. Your grades stay under rubric 3 until then.
                  </>}
                  {state === 'promote' && <>
                    <strong style={{ color: 'rgb(var(--outcome-win))' }}>Verdict: promote.</strong> The sample is in and delivery-only setups made money on average.
                    Promoting makes rubric {TRIAL_RUBRIC} the one new trades are graded under; old trades keep their grades. It is a change to the app — ask for it in the next update.
                  </>}
                  {state === 'drop' && <>
                    <strong style={{ color: 'rgb(var(--outcome-loss))' }}>Verdict: drop.</strong> The sample is in and delivery-only setups lost on average — the sweep gate in
                    rubric 3 was right. Dropping ends the trial; the answers it collected stay on the trades. Ask for it in the next update.
                  </>}
                </p>
              </section>
            );
          })()}

              {preOnly && (
                <p className="pt-1 text-center text-[11px]" style={{ color: 'rgb(var(--accent))' }}>
                  Showing only trades graded before the outcome was known — {trades.length} of {scoped.length}.
                </p>
              )}

              {agg.passed > 0 && (
                <p className="pt-1 text-center text-[11px]" style={{ color: 'var(--text-faint)' }}>
                  {agg.passed} setup{agg.passed === 1 ? '' : 's'} passed on — journalled, but never counted in any
                  number above.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
