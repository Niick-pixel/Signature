import { cookies } from 'next/headers';
import { listTrades } from '@/db/trades';
import { accountCookie } from '@/lib/account-pref';
import { ACCOUNT_VALUES, MIN_SAMPLE, REASON_HUE, isBacktest, isDated, isHypothetical, isReal, isSeparate, type Account } from '@/lib/domain';
import { reasonAccent } from '@/lib/layout';
import {
  accountsInUse, aggregate, byConfidence, byGradeBand, checklistEdge, discipline, edge,
  deliveryOnlyVerdict, equityCurves, excursion, targetHits, forAccount, gradeHonesty, hesitation, modelBreakdowns, money, passedSetups,
  preGradedOnly, rByMarketTag, rByMistakeTag, rByReason, rByWorkedTag, rHistogram, streaks, whenHeatmap,
} from '@/lib/stats';
import { Histogram } from '@/components/stats/Histogram';
import { WhenHeatmap } from '@/components/stats/WhenHeatmap';
import { EquityChart } from '@/components/stats/EquityChart';
import { gapTrend } from '@/lib/adherence';
import { HypotheticalNote } from '@/components/money/MissedCard';
import { StatsFilters } from '@/components/stats/StatsFilters';
import { accountParam, applyStatsScope, mixesWorlds, parseStatsScope } from '@/lib/statsScope';
import { Line, Panel, SignedBars, Stat, type BarRow } from '@/components/stats/Bars';
import { listPreps } from '@/db/prep';
import { planSplit } from '@/lib/planMatch';
import { DrawdownSim } from '@/components/stats/DrawdownSim';
import { TitleBar } from '@/components/shell/TitleBar';
import { MissedPatternsView } from '@/components/stats/MissedPatterns';
import { BreakdownTable } from '@/components/stats/ModelBreakdown';
import { GATES_SINCE, TRIAL_RUBRIC, TRIAL_SAMPLE } from '@/lib/rubric';
import { missedPatterns } from '@/lib/missed';
import { listDailyReviews } from '@/db/reviews';
import { tradeDay } from '@/lib/when';
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
  const all = listTrades();
  const accounts = accountsInUse(all);

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
  /*
    The gates only exist from rubric 2 on. Every trade is in by default — the
    sweep of an older trade is known when its MAJOR box was ticked — but
    ?gates=1 narrows the model tables to trades graded with the gates, which
    is the only honest test of whether the gates themselves work.
  */
  const gatedOnly = params.gates === '1';
  const sameFilters = (list: typeof all) => (preOnly ? preGradedOnly(list) : list)
    .filter((t) => (!noQuick || !t.quick_log) && (!gatedOnly || t.rubric_version >= GATES_SINCE));
  const model = modelBreakdowns(sameFilters(trades), sameFilters(all));
  // The trial counts the skipped setups logged in Missed as well — on any
  // account's page, not only on Missed's (where they are already the selection).
  const trialVerdict = deliveryOnlyVerdict(sameFilters(trades),
    // Not on Backtest's page: a replay's verdict is its own.
    single && isSeparate(single) ? [] : sameFilters(all.filter((t) => isHypothetical(t.account))));
  const modelLink = `/stats?${new URLSearchParams({
    // Always carried, 'All' included: without it the page falls back to
                  // the remembered account and the filter silently changes accounts.
                  account, ...filterParams,
    ...(preOnly ? { pregraded: '1' } : {}),
    ...(noQuick ? { quick: '0' } : {}),
    ...(gatedOnly ? {} : { gates: '1' }),
  })}#model`;
  const agg = aggregate(trades);
  // Each trade against that morning's chart prep (lib/planMatch).
  const plan = planSplit(trades, new Map(listPreps().map((p) => [p.day, p.data])));
  const planned = plan.rows[0].taken + plan.rows[1].taken;
  // The simulator's inputs: every R result in view, and a typical risk.
  const simR = trades.filter((t) => t.outcome !== 'Not taken' && t.r_multiple != null).map((t) => t.r_multiple as number);
  const risks = trades.map((t) => t.risk_dollars ?? (t.pnl_dollars != null && t.r_multiple ? Math.abs(t.pnl_dollars / t.r_multiple) : null))
    .filter((v): v is number => v != null && v > 0).sort((a, b) => a - b);
  const typicalRisk = risks.length ? risks[Math.floor(risks.length / 2)] : null;
  const m = money(trades);
  const e = edge(trades);
  const d = discipline(trades);
  const trend = gapTrend(trades);
  const taken = trades.filter((t) => t.outcome !== 'Not taken');
  const withR = taken.filter((t) => t.r_multiple != null);
  const runs = streaks(trades);
  const tradingDays = new Set(taken.filter(isDated).map((t) => t.date.slice(0, 10))).size;
  const tagged = (key: 'mistake_tags' | 'worked_tags' | 'market_tags') => taken.filter((t) => (t[key] ?? []).length > 0).length;
  const honesty = gradeHonesty(trades);
  const hes = hesitation(trades);
  const curves = equityCurves(trades);
  const bands = byGradeBand(trades);
  const conf = byConfidence(trades);
  const exc = excursion(trades);
  const hits = targetHits(trades);
  const passed = passedSetups(trades);
  const tagRows: BarRow[] = rByMistakeTag(trades).map((t) => ({
    label: t.tag, value: t.totalR, display: r(t.totalR), meta: `· ${t.count}`,
  }));
  const workedRows: BarRow[] = rByWorkedTag(trades).map((t) => ({
    label: t.tag, value: t.totalR, display: r(t.totalR), meta: `· ${t.count}`,
  }));
  const marketRows: BarRow[] = rByMarketTag(trades).map((t) => ({
    label: t.tag, value: t.totalR, display: r(t.totalR), meta: `· ${t.count}`,
  }));

  const reasonRows: BarRow[] = rByReason(trades).map((g) => ({
    label: g.key, value: g.stats.totalR, display: r(g.stats.totalR),
    meta: `· ${g.stats.count}`, swatch: reasonAccent(g.key),
  }));







  // Every row here is a loss, so they all take the loss colour. Tinting them by
  // reason hue put a green bar in a panel about what is costing you.

  // Rule-following against rule-breaking. Two bars, because the comparison is
  // the whole point — a rule-breaking total on its own means nothing.

  // Negative, because R you did not take is R you did not make — a green bar
  // here would read as a win.
  const skipRows: BarRow[] = hes.byReason.map((g) => ({
    label: g.reason, value: -g.rLeft, display: g.rLeft ? `−${g.rLeft.toFixed(1)}R` : '—',
    meta: `· ${g.count} skipped`,
  }));

  // Only items with trades on both sides can be compared at all.
  const itemRows: BarRow[] = checklistEdge(trades)
    .filter((i) => i.lift != null)
    .sort((a, b) => (b.lift as number) - (a.lift as number))
    .map((i) => ({
      label: `${i.label} (${i.points})`,
      value: i.lift as number,
      display: r2(i.lift),
      meta: `· ${i.withCount} with · ${i.withoutCount} without`,
    }));

  return (
    <div className="flex h-dvh flex-col">
      <TitleBar />
      <div className="signature-enter min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[68rem] px-6 pb-20 pt-4">
          <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-[22px] font-semibold tracking-tight">Stats</h1>
            <div className="flex flex-wrap items-center gap-3">

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

          <div className="mb-5"><StatsFilters available={accounts} scope={scope} /></div>

          {mixesWorlds(scope.accounts) && (
            <p data-mixed-note className="mb-5 rounded-[calc(14px*var(--rk))] px-3.5 py-2.5 text-[12px] leading-relaxed"
              style={{ background: 'rgb(var(--amber) / 0.08)', border: '1px solid rgb(var(--amber) / 0.25)', color: 'rgb(var(--amber))' }}>
              Mixed: real trades are counted together with {scope.accounts.filter((a) => !isReal(a)).map((a) => isBacktest(a) ? 'backtest replays' : 'missed setups').join(' and ')} here.
              Every total below includes them — pick accounts above to see one world at a time.
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

          {/*
            The rubric 4 trial, where it can be seen: how far the sample has
            got and, once it is in, what it says. The full table stays with
            the model breakdowns below.
          */}
          {TRIAL_RUBRIC != null && (() => {
            const v = trialVerdict;
            const pct = Math.min(100, Math.round((v.n / TRIAL_SAMPLE) * 100));
            const state = !v.ready ? 'collecting' : v.positive ? 'promote' : 'drop';
            const hue = state === 'promote' ? '--outcome-win' : state === 'drop' ? '--outcome-loss' : '--accent';
            return (
              <section data-trial-card={state} className="glass mb-5 rounded-[calc(20px*var(--rk))] px-5 py-4"
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

          {trades.length === 0 ? (
            <div className="glass rounded-[calc(24px*var(--rk))] p-8 text-center text-[13px]" style={{ color: 'var(--text-dim)' }}>
              Nothing to measure yet.
            </div>
          ) : (
            <div className="space-y-5">
              {/*
              {/*
                Twenty-five panels, cut to eleven.

                Most of what was here described the record rather than
                interrogating it: R by instrument, by session, by setup, an R
                distribution, a heatmap of which hour I trade. All true, and
                none of it anything I would do differently on Monday for having
                read it. What is left answers one of three questions — did I
                follow the plan, is the plan actually an edge, and where am I
                lying to myself — and each one has an action attached to it.
              */}
              <Panel
                n={d.followed.count + d.broken.count}
                title="Adherence"
                note="Share of the SCORED trades where the checklist says the rules were followed — trigger fired, 70% or more of the boxes that APPLIED, both gates passed (rubric 2 trades). Derived, never self-reported; the What went wrong tags are notes and never count against it. A box marked N/A takes its points out of the denominator instead of counting as a miss, and a trade whose checklist was left blank counts as neither followed nor broken."
              >
                <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
                  <div>
                    <div
                      className="tabular-nums text-[46px] font-semibold leading-none tracking-tight"
                      style={{
                        color: d.adherenceRate == null ? 'var(--text-faint)'
                          : d.adherenceRate >= 0.7 ? 'rgb(var(--outcome-win))'
                          : d.adherenceRate >= 0.4 ? 'rgb(var(--accent))'
                          : 'rgb(var(--outcome-loss))',
                      }}
                    >
                      {pct(d.adherenceRate)}
                    </div>
                    <div className="mt-2 text-[11px]" style={{ color: 'var(--text-faint)' }}>
                      n = {d.followed.count + d.broken.count}
                      {d.unscored.count > 0 && ` · ${d.unscored.count} not scored`}
                      {(d.followed.count + d.broken.count) < 20 && ' — too few to conclude anything'}
                    </div>
                  </div>
                  <div className="flex-1 min-w-[12rem]">
                    <Line label="Followed the rules" value={`${d.followed.count} · ${r(d.followed.totalR)}`} tone="win" />
                    <Line label="Broke a rule" value={`${d.broken.count} · ${r(d.broken.totalR)}`} tone="loss" />
                    {d.unscored.count > 0 && (
                      <Line
                        label="Not scored"
                        value={`${d.unscored.count} · ${r(d.unscored.totalR)}`}
                      />
                    )}
                  </div>
                </div>
              </Panel>

              <Panel
                n={withR.length}
                title="Following the rules vs breaking them"
                note="Cumulative R, in the order the trades happened, split by what the checklist says about each one."
              >
                <EquityChart followed={curves.followed} broken={curves.broken} />
              </Panel>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {/*
                  No balance tile here. Where the account stands lives on the
                  Calendar, next to the days that moved it and the button that
                  funds it; repeating it on Stats gave the same number two homes
                  and no single place that owns it.
                */}
                <Stat
                  n={m.priced}
                  label="Net P&L"
                  value={m.priced ? usd(m.net) : '—'}
                  sub={m.priced ? `${usd(m.won)} won · ${usd(m.lost)} lost` : 'No money recorded yet'}
                  tone={m.net > 0 ? 'win' : m.net < 0 ? 'loss' : null}
                />
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
                />
                <Stat
                  n={withR.length}
                  label="Expectancy"
                  value={r2(e.expectancy)}
                  sub="Average R per trade taken"
                  tone={(e.expectancy ?? 0) > 0 ? 'win' : (e.expectancy ?? 0) < 0 ? 'loss' : null}
                />
                {/*
                  Gross won over gross lost. One number, and the one that says
                  whether the winners are actually paying for the losers — a
                  60% win rate under 1.0 is a losing strategy with good manners.
                */}
                <Stat
                  n={withR.length}
                  label="Profit factor"
                  value={e.profitFactor == null ? '—' : e.profitFactor.toFixed(2)}
                  sub={e.profitFactor == null ? 'Needs a win and a loss'
                    : e.profitFactor >= 1 ? 'Winners cover the losers' : 'Losers outweigh the winners'}
                  tone={e.profitFactor == null ? null : e.profitFactor >= 1 ? 'win' : 'loss'}
                />
              </div>

              {/* Where I am lying to myself. */}
              <div className="grid gap-5 lg:grid-cols-2">
                <Panel
                  n={d.gap.answered}
                  title="Self-assessment gap"
                  note="How often I said I followed every rule and the checklist disagreed. That gap closing is real progress — and it cannot be faked by being hard on myself, which shows up as the row below it instead."
                >
                  {d.gap.answered === 0 ? (
                    <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>
                      Nothing answered yet. The question is unset on every trade, which is the honest
                      state — stats read the checklist regardless, so leaving it blank costs nothing.
                    </p>
                  ) : (
                    <>
                      <div
                        className="tabular-nums text-[34px] font-semibold leading-none tracking-tight"
                        style={{
                          color: (d.gap.overclaimRate ?? 0) > 0.2
                            ? 'rgb(var(--outcome-loss))' : 'rgb(var(--outcome-win))',
                        }}
                      >
                        {pct(d.gap.overclaimRate)}
                      </div>
                      <p className="mb-3 mt-2 text-[11px]" style={{ color: 'var(--text-faint)' }}>
                        said yes when the checklist said no · n = {d.gap.answered}
                        {d.gap.answered < 20 && ' — too few to conclude anything'}
                      </p>
                      <Line label="Agreed" value={String(d.gap.agreed)} tone="win" />
                      <Line label="Overclaimed" value={String(d.gap.overclaimed)}
                        tone={d.gap.overclaimed ? 'loss' : null} />
                      <Line label="Underclaimed" value={String(d.gap.underclaimed)} />
                      <Line label="Never answered" value={String(d.gap.unanswered)} />
                      {/* Month by month: the gap closing is the progress. */}
                      {trend.length > 1 && (
                        <div data-gap-trend className="mt-4">
                          <div className="mb-1.5 text-[10px] uppercase tracking-[0.07em]" style={{ color: 'var(--text-faint)' }}>
                            Overclaimed, by month
                          </div>
                          <div className="flex items-end gap-2">
                            {trend.map((m) => (
                              <div key={m.month} className="flex flex-1 flex-col items-center gap-1"
                                title={`${m.month}: ${m.overclaimed} of ${m.answered} answered`}>
                                <span className="tabular-nums text-[10px]" style={{ color: 'var(--text-dim)' }}>{pct(m.rate)}</span>
                                <div className="w-full rounded-t-[3px]" style={{
                                  height: `${Math.max(3, Math.round((m.rate ?? 0) * 44))}px`,
                                  background: (m.rate ?? 0) > 0.2 ? 'rgb(var(--outcome-loss) / 0.7)' : 'rgb(var(--outcome-win) / 0.7)',
                                }} />
                                <span className="text-[9.5px] tabular-nums" style={{ color: m.answered < 5 ? 'rgb(var(--amber))' : 'var(--text-faint)' }}>
                                  {new Date(`${m.month}-15`).toLocaleDateString(undefined, { month: 'short' })} · {m.answered}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </Panel>
                <Panel
                  n={honesty.regraded}
                  title="Grade honesty"
                  note="The score at entry against the re-grade after the close. A pattern of dropping means the boxes are being ticked to reach a number."
                >
                  {honesty.regraded === 0 ? (
                    <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>
                      No trades re-graded yet. Without a re-grade there is nothing to check the checklist against.
                    </p>
                  ) : (
                    <>
                      <Line label="Re-graded" value={`${honesty.regraded} of ${agg.count}`} />
                      <Line label="Graded too kindly" value={String(honesty.inflated)}
                        tone={honesty.inflated ? 'loss' : 'win'} />
                      <Line label="Held up" value={String(honesty.matched)} tone="win" />
                      <Line label="Graded too harshly" value={String(honesty.understated)} />
                      <Line
                        label="Average re-grade"
                        value={honesty.averageDrop == null ? '—' : honesty.averageDrop === 0
                          ? 'Unchanged'
                          : `${Math.abs(honesty.averageDrop).toFixed(1)} steps ${honesty.averageDrop > 0 ? 'lower' : 'higher'}`}
                        tone={(honesty.averageDrop ?? 0) > 0 ? 'loss' : 'win'}
                      />
                      {honesty.worst.length > 0 && (
                        <div className="mt-3 space-y-1">
                          {honesty.worst.map((w) => (
                            <div key={w.trade.id} className="flex items-baseline justify-between gap-3 text-[11px]">
                              <span className="truncate" style={{ color: 'var(--text-dim)' }}>
                                {tradeDay(w.trade)} · {w.trade.reason}
                              </span>
                              <span className="shrink-0 tabular-nums" style={{ color: 'rgb(var(--outcome-loss))' }}>
                                {w.from} → {w.to}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </Panel>
              </div>

              {/* Whether the plan is an edge, and which parts of it are. */}
              <div className="grid gap-5 lg:grid-cols-2">
                <Panel
                  n={bands.reduce((sum, b) => sum + b.taken, 0)}
                  title="Win rate by grade band"
                  note="Does the checklist predict anything? If these do not climb, it does not — and n is on every row because four trades can show any number at all."
                >
                  <div className="space-y-1">
                    {bands.map((b) => (
                      <div key={b.label} className="flex items-baseline justify-between gap-3 py-1">
                        <span className="text-[12px]" style={{ color: 'var(--text-dim)' }}>{b.label}</span>
                        <span className="flex items-baseline gap-3">
                          <span className="tabular-nums text-[12px] font-semibold">{pct(b.winRate)}</span>
                          <span className="tabular-nums text-[11px]" style={{ color: 'var(--text-faint)' }}>
                            {r2(b.expectancy)}
                          </span>
                          <span
                            className="tabular-nums text-[11px]"
                            style={{ color: b.thin ? 'rgb(var(--amber))' : 'var(--text-faint)' }}
                          >
                            n {b.taken}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                  {bands.some((b) => b.thin) && (
                    <p className="mt-3 text-[11px] leading-snug" style={{ color: 'rgb(var(--amber))' }}>
                      Bands marked in amber have fewer than {MIN_SAMPLE} taken trades. Those numbers
                      are noise — do not change anything because of them.
                    </p>
                  )}
                </Panel>
                <Panel
                  n={withR.length}
                  title="Is each box earning its weight?"
                  note="Average R with the box ticked, minus average R without it. A 20-point item with no lift, or a 5-point item with a large one, is an argument that the weights are wrong."
                >
                  {itemRows.length ? <SignedBars rows={itemRows} /> : (
                    <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>
                      Not enough trades yet — each box needs trades on both sides of it to be compared.
                    </p>
                  )}
                </Panel>
              </div>

              {/*
                The rubric's own claims, tested. Every rule the checklist grades
                by — the sweep tier, the single gap, the target, the letter it
                all adds up to — split by its answer, with the account table
                beside them so Live and Demo can be read against each other.
              */}
              <div id="model">
                <Panel
                  n={model.entryGrade.reduce((n, row) => n + row.stats.taken, 0)}
                  title="Does the model hold?"
                  note="Count, win rate and net R for each answer to each gate. If NONE sweeps and stacked gaps pay as well as the rest, the gates are wrong. Trades graded before rubric 2 show their sweep only if the MAJOR box was ticked, and their gap as not recorded."
                >
                  <div className="mb-4 flex flex-wrap items-center gap-2 text-[11px]" style={{ color: 'var(--text-faint)' }}>
                    <a href={modelLink} data-rubric-filter={gatedOnly ? 'on' : 'off'}
                      className="rounded-full border px-3 py-1 font-medium"
                      style={{
                        borderColor: gatedOnly ? 'rgb(var(--accent) / 0.55)' : 'var(--glass-stroke)',
                        background: gatedOnly ? 'rgb(var(--accent) / 0.12)' : 'var(--glass-fill)',
                        color: gatedOnly ? 'rgb(var(--accent))' : 'var(--text-dim)',
                      }}
                      title="Only trades graded with the gates (rubric 2 onwards)">
                      Graded with the gates only
                    </a>
                    <span>{gatedOnly ? 'Trades graded with the gates only.' : 'Every rubric.'} Passed setups are not counted.</span>
                  </div>
                  <div className="grid gap-x-8 gap-y-6 lg:grid-cols-2">
                    <BreakdownTable title="Sweep tier" rows={model.sweepTier} note="gate: NONE caps at C" />
                    <BreakdownTable title="Singular gap" rows={model.singularGap} note="gate: stacked caps at C" />
                    <BreakdownTable title="Target type" rows={model.targetType} note="ranked strongest first · LRLR caps at B" />
                    <BreakdownTable title="Grade at entry" rows={model.entryGrade} note="the frozen letter" />
                    <BreakdownTable title="Account" rows={model.account} note="every account, same filters" />
                    {TRIAL_RUBRIC != null && (
                      <div data-trial-verdict={trialVerdict.ready ? (trialVerdict.positive ? 'promote' : 'drop') : 'collecting'}>
                        <BreakdownTable title={`Liquidity event · rubric ${TRIAL_RUBRIC} trial`} rows={model.liquidityTrial}
                          note="delivery only caps at B" />
                        <p className="mt-2 text-[11px] leading-snug" style={{ color: 'var(--text-faint)' }}>
                          Delivery-only setups: {trialVerdict.n}/{TRIAL_SAMPLE}
                          {trialVerdict.missed > 0 && <> ({trialVerdict.real} taken, {trialVerdict.missed} from Missed)</>}
                          {trialVerdict.avgR != null && <> · avg {trialVerdict.avgR >= 0 ? '+' : '−'}{Math.abs(trialVerdict.avgR).toFixed(2)}R</>}
                          {'. '}
                          {!trialVerdict.ready
                            ? 'Still collecting — log the ones you skip in Missed so the sample fills without risking money.'
                            : trialVerdict.positive
                              ? `Sample is in and positive: rubric ${TRIAL_RUBRIC} has earned a promotion review.`
                              : 'Sample is in and not positive: drop the delivery path — the sweep-only gate was right.'}
                        </p>
                      </div>
                    )}
                  </div>
                </Panel>
              </div>

              <Panel n={simR.length} title="What's normal pain"
                note="Your results reshuffled into 2,000 possible futures: the drawdown and losing streak to expect, and how often a limit would be hit at your risk. A streak inside the typical range is the strategy being itself, not broken.">
                <DrawdownSim rs={simR} defaultRisk={typicalRisk} />
              </Panel>

              <Panel n={planned} title="Trading the plan"
                note="Each trade against that morning's chart prep: the side you said you would take, the sweep you said you would wait for, the target you picked, and the entry time (converted from Costa Rica to New York time) against your first-entry and done-by times. The checklist asks if a setup was good; this asks if it was the one you planned.">
                {planned === 0 ? (
                  <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>
                    Nothing to compare yet. Fill in &ldquo;Today I take&rdquo;, &ldquo;Sweep to wait for&rdquo; or the target in the morning&rsquo;s chart prep (press P), and the trades that day are set against it.
                  </p>
                ) : (
                  <div data-plan-split className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
                    <div className="space-y-1">
                      {plan.rows.map((r) => (
                        <Line key={r.key}
                          label={`${r.label} · ${r.taken} trade${r.taken === 1 ? '' : 's'}${r.wins + r.losses ? ` · ${Math.round((r.wins / (r.wins + r.losses)) * 100)}% won` : ''}`}
                          value={r.taken ? `${r.totalR >= 0 ? '+' : '−'}${Math.abs(r.totalR).toFixed(1)}R` : '—'}
                          tone={r.taken === 0 || r.key === 'none' ? null : r.totalR >= 0 ? 'win' : 'loss'} />
                      ))}
                    </div>
                    <div className="space-y-1">
                      {plan.reasons.length === 0 ? (
                        <p className="text-[11.5px] leading-snug" style={{ color: 'var(--text-faint)' }}>
                          No trade has gone off plan yet.
                        </p>
                      ) : plan.reasons.map(([why, n]) => (
                        <Line key={why} label={why} value={`${n}×`} tone="loss" />
                      ))}
                    </div>
                  </div>
                )}
              </Panel>

              <div className="grid gap-5 lg:grid-cols-2">
                <Panel n={agg.taken} title="R by reason" note="Net, worst first. This is the list that changes how you trade.">
                  <SignedBars rows={reasonRows} />
                </Panel>
                <Panel n={tagged('mistake_tags')} title="R by mistake" note="Every tag on every trade, worst first. A tag on a winner still counts.">
                  {tagRows.length ? <SignedBars rows={tagRows} /> : (
                    <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>Nothing tagged yet.</p>
                  )}
                </Panel>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
              <Panel n={tagged('market_tags')} title="R by what the market did" note="Outside your control, worst first. Next to R by mistake, it splits a bad run into process and luck: if most of the lost R sits here and not there, the execution is fine.">
                {marketRows.length ? <SignedBars rows={marketRows} /> : (
                  <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>
                    Nothing tagged yet. &ldquo;What the market did&rdquo; is on the trade form, under what went wrong.
                  </p>
                )}
              </Panel>
              <Panel n={tagged('worked_tags')} title="R by what worked" note="The other half: what went right, on every trade taken, best first. A habit that shows up on your winners and your well-traded losers is the one to keep.">
                {workedRows.length ? <SignedBars rows={workedRows} /> : (
                  <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>
                    Nothing tagged yet. &ldquo;What worked&rdquo; is on the trade form, beside what went wrong.
                  </p>
                )}
              </Panel>
              </div>

              {/* What to change. Each of these names a behaviour. */}
              <div className="grid gap-5 lg:grid-cols-2">
                <Panel
                  n={exc.losersWithData}
                  title="Management or selection?"
                  note="Whether the losers were ever winners. If most of them were up a full R before stopping out, the entries were fine and the exits were not — and no win rate will ever tell you that."
                >
                  {exc.losersWithData === 0 ? (
                    <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>
                      Nothing recorded yet. &ldquo;Reached +1R before the stop?&rdquo; is an optional
                      question on the trade form.
                    </p>
                  ) : (
                    <>
                      <Line
                        label="Losers that reached +1R first"
                        value={`${exc.losersThatReached1R} of ${exc.losersWithData}`}
                        tone={exc.losersThatReached1R > exc.losersWithData / 2 ? 'loss' : 'win'}
                      />
                      {exc.losersThatReached1R > exc.losersWithData / 2 ? (
                        <p className="mt-2.5 text-[11px] leading-snug" style={{ color: 'rgb(var(--amber))' }}>
                          More than half your losers were up a full R before they stopped you out. That is
                          a management problem, not a selection one.
                        </p>
                      ) : (
                        <p className="mt-2.5 text-[11px] leading-snug" style={{ color: 'var(--text-faint)' }}>
                          Most losers never went your way. Those are selection, not management — the exits
                          are not what is costing you.
                        </p>
                      )}
                    </>
                  )}
                </Panel>
                {/* Only while old trades carry answers: the question left the form. */}
                {hits.answered > 0 && (
                <Panel
                  n={hits.answered}
                  title="Which targets get hit"
                  note="Hit rate of the named target before the stop, by target class (ranked strongest draw first), by level, and by whether it was fresh or the other side had already gone. Your data, not the textbook ranking."
                >
                  {hits.answered === 0 ? (
                    <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>
                      Nothing recorded yet. &ldquo;Target hit before the stop?&rdquo; is an optional
                      question on the trade form.
                    </p>
                  ) : (
                    <div data-target-hits className="space-y-3">
                      <div data-target-classes className="space-y-1">
                        {hits.byClass.filter((r) => r.answered > 0).map((r) => (
                          <Line key={r.key} label={`${r.rank != null ? `${r.rank}. ` : ''}${r.label} · ${r.answered}`}
                            value={r.rate == null ? '—' : `${Math.round(r.rate * 100)}%`}
                            tone={r.rate != null && r.rate >= 0.5 ? 'win' : 'loss'} />
                        ))}
                        <p className="pt-0.5 text-[11px] leading-snug" style={{ color: 'var(--text-faint)' }}>
                          {hits.upset
                            ? `Your trades disagree with the ranking: ${hits.upset.lower} is out-hitting ${hits.upset.higher}.`
                            : `Numbered by expected pull, strongest first. A class needs ${MIN_SAMPLE} answers before its rate says much.`}
                        </p>
                      </div>
                      {[hits.byType, hits.fresh, hits.opposite].map((rows, i) => (
                        <div key={i} className="space-y-1">
                          {rows.filter((r) => r.answered > 0).map((r) => (
                            <Line key={r.key} label={`${r.label} · ${r.answered}`}
                              value={r.rate == null ? '—' : `${Math.round(r.rate * 100)}%`}
                              tone={r.rate != null && r.rate >= 0.5 ? 'win' : 'loss'} />
                          ))}
                        </div>
                      ))}
                      {hits.mfe.n > 0 && (
                        <p className="text-[11px] leading-snug" style={{ color: 'var(--text-faint)' }}>
                          Max R reached: avg {hits.mfe.avg!.toFixed(2)}R over {hits.mfe.n} trade{hits.mfe.n === 1 ? '' : 's'};
                          {' '}{hits.mfe.reached2R} reached 2R or more.
                        </p>
                      )}
                    </div>
                  )}
                </Panel>
                )}
                <Panel
                  n={hes.skipped}
                  title="What hesitating cost"
                  note="A skipped setup that would have won is a real loss that never reaches the P&L — which is exactly why it goes unexamined."
                >
                  {hes.skipped === 0 ? (
                    <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>
                      No setups passed on yet.
                    </p>
                  ) : (
                    <>
                      <Line label="Setups skipped" value={String(hes.skipped)} />
                      <Line label="Actually checked afterwards"
                        value={`${hes.checked} of ${hes.skipped}`}
                        tone={hes.checked === hes.skipped ? 'win' : null} />
                      <Line label="Would have won" value={String(hes.wouldHaveWon)} tone="loss" />
                      <Line label="Would have lost" value={String(hes.wouldHaveLost)} tone="win" />
                      <Line label="R left on the table"
                        value={hes.rLeft ? `−${hes.rLeft.toFixed(1)}R` : '0.0R'}
                        tone={hes.rLeft ? 'loss' : 'win'} />
                      <Line label="R the skips saved you"
                        value={`+${hes.rAvoided.toFixed(1)}R`} tone="win" />
                      {skipRows.length > 0 && (
                        <div className="mt-3">
                          <SignedBars rows={skipRows} />
                        </div>
                      )}
                      {hes.checked < hes.skipped && (
                        <p className="mt-2.5 text-[11px] leading-snug" style={{ color: 'var(--text-faint)' }}>
                          {hes.skipped - hes.checked} skipped setup
                          {hes.skipped - hes.checked === 1 ? ' has' : 's have'} never been checked. Until they are,
                          the number above is the floor, not the cost.
                        </p>
                      )}
                    </>
                  )}
                </Panel>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <Panel
                  n={conf.reduce((sum, c) => sum + c.taken, 0)}
                  title="Calibration"
                  note="Win rate by the confidence you claimed before you knew. If the 5s do not beat the 2s, the read is noise and size stays flat until it isn't."
                >
                  {conf.length === 0 ? (
                    <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>
                      No confidence recorded yet. It only means anything if it is set before the outcome.
                    </p>
                  ) : (
                    conf.map((c) => (
                      <div key={c.label} className="flex items-baseline justify-between gap-3 py-1">
                        <span className="text-[12px]" style={{ color: 'var(--text-dim)' }}>
                          {'★'.repeat(Number(c.label))}
                        </span>
                        <span className="flex items-baseline gap-3">
                          <span className="tabular-nums text-[12px] font-semibold">{pct(c.winRate)}</span>
                          <span className="tabular-nums text-[11px]" style={{ color: c.thin ? 'rgb(var(--amber))' : 'var(--text-faint)' }}>
                            n {c.taken}
                          </span>
                        </span>
                      </div>
                    ))
                  )}
                </Panel>
              </div>

              {/*
                The record, shown as a record: the shape of the results, the
                runs, and when the trading happens. Below the panels that ask
                questions, because these describe rather than interrogate.
              */}
              <div className="grid gap-5 lg:grid-cols-2">
                <Panel n={withR.length} title="R distribution"
                  note="Every trade taken, by its R. A fat left tail is a stop problem; a thin right one is a target problem.">
                  <Histogram bins={rHistogram(trades)} />
                </Panel>
                <Panel n={tradingDays} title="Streaks"
                  note="Consecutive days journalled, and consecutive days where every trade followed the rules — the checklist's verdict, not yours.">
                  <Line label="Days journalled in a row — now" value={String(runs.journalingCurrent)} />
                  <Line label="Days journalled in a row — best" value={String(runs.journalingBest)} />
                  <Line label="Rule-following days in a row — now" value={String(runs.adherenceCurrent)}
                    tone={runs.adherenceCurrent > 0 ? 'win' : null} />
                  <Line label="Rule-following days in a row — best" value={String(runs.adherenceBest)} tone="win" />
                </Panel>
              </div>
              <Panel n={withR.length} title="When it works"
                note="Net R by entry hour and weekday. A red column you keep trading into is the cheapest rule you will ever write.">
                <WhenHeatmap cells={whenHeatmap(trades)} />
              </Panel>

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
