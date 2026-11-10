import { cookies } from 'next/headers';
import { accountCookie } from '@/lib/account-pref';
import { isBacktest, isDated, isHypothetical, isReal } from '@/lib/domain';
import { trialLine } from '@/lib/stats';
import { EdgeHero } from '@/components/stats/EdgeHero';
import { BEHAVIOUR_HELP, BehaviourCard, behaviourSummary } from '@/components/stats/BehaviourCard';
import { unlocked } from '@/lib/edge/maturity';
import { VERDICT_LABEL } from '@/lib/edge/verdict';
import { Collapsible } from '@/components/stats/EdgeUI';
import { IntegrityBanner } from '@/components/stats/IntegrityBanner';
import { MaturityRing } from '@/components/stats/MaturityRing';
import { FocusCard } from '@/components/stats/FocusCard';
import { EquityRisk } from '@/components/stats/EquityRisk';
import { AnatomyExplorer } from '@/components/stats/AnatomyExplorer';
import { LedgerView } from '@/components/stats/LedgerView';
import { EvalPanel, LabProvider, RuleLabPanel } from '@/components/stats/Lab';
import { packRows } from '@/lib/edge/ruleLab';
import { QualityPanel } from '@/components/stats/QualityPanel';
import { SimilarLookup } from '@/components/stats/SimilarLookup';
import { ExecutionPanel } from '@/components/stats/ExecutionPanel';
import { MissedPanel } from '@/components/stats/MissedPanel';
import { LanguagePanel } from '@/components/stats/LanguagePanel';
import { HealthPanel } from '@/components/stats/HealthPanel';
import { KeyPoints } from '@/components/stats/KeyPoints';
import { WhenOpen } from '@/components/stats/WhenOpen';
import { listBlindGrades } from '@/db/edge';
import { hitRates } from '@/lib/edge/claims';
import { blindCounter } from '@/lib/edge/blind';
import { DEFAULT_THRESHOLDS } from '@/lib/edge/verdict';
import { field as fieldDef } from '@/lib/edge/fields';
import { localDay } from '@/lib/day';
import { HypotheticalNote } from '@/components/money/MissedCard';
import { StatsFilters } from '@/components/stats/StatsFilters';
import { Panel } from '@/components/stats/Bars';
import { TitleBar } from '@/components/shell/TitleBar';
import { MissedPatternsView } from '@/components/stats/MissedPatterns';
import { TRIAL_RUBRIC } from '@/lib/rubric';
import { missedPatterns } from '@/lib/missed';
import { listDailyReviews } from '@/db/reviews';
import { BacktestNote } from '@/components/money/BacktestCard';
import Link from 'next/link';
import { statsEngine } from '@/db/statsEngine';

export const dynamic = 'force-dynamic';

// A typographic minus, not a hyphen — it matches the digit width, so a column
// of R values lines up instead of stepping in and out by a pixel.
const signed = (v: number, dp: number) => `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(dp)}R`;
const r2 = (v: number | null) => (v == null ? '—' : signed(v, 2));

export default async function StatsPage(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> },
) {
  const params = await searchParams;
  // The engine's outputs for this scope (db/statsEngine): the page only draws them.
  const {
    scoped,
    leftOutWorlds,
    thresholds,
    thresholdChanges,
    lockNote,
    winHref,
    everything,
    all,
    hindsight,
    accounts,
    scope,
    single,
    account,
    undatedOut,
    filterParams,
    preOnly,
    noQuick,
    quickCount,
    trades,
    agg,
    curves,
    settled,
    metrics,
    replay,
    realMetrics,
    tilt,
    hesitation,
    scopeLabel,
    mat,
    window,
    latestRubric,
    backtests,
    btEligible,
    btWeight,
    btPrior,
    engine,
    claims,
    btGap,
    issues,
    focus,
    ledger,
    brierScore,
    blind,
    preCompleteness,
    lang,
    missed,
    rs,
    cone,
    split,
    adh,
    thumbs,
    lab,
    labEach,
    bestLab,
    evalPresets,
    quality,
    model,
    mv,
    simTarget,
    similar,
    simOptions,
    exec,
    summary,
    SHOWN,
    cut,
    thumbsOf,
    visibleRows,
    strongest,
    trial,
  } = statsEngine(params, (await cookies()).get(accountCookie('stats'))?.value);

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
              <Link href="/blind" prefetch={false} className="rounded-full border px-3 py-1 font-medium" style={pill(false)} title="Grade past setups with the outcome hidden" data-blind-link>Blind re-grade · {listBlindGrades().length ? blindCounter(listBlindGrades(), localDay()).thisWeek : 0} this week</Link>
              <Link href="/reports" prefetch={false} className="rounded-full border px-3 py-1 font-medium" style={pill(false)} title="Compare, breakdowns, fees, the rules heatmap, your tags (R)">Reports →</Link>
              <Link href="/analytics" prefetch={false} className="rounded-full border px-3 py-1 font-medium" style={pill(false)} title="Time, confluences, psychology, mistake cost, what if, tilt, news (A)" data-analytics-link>Analytics →</Link>
            </div>
          </header>

          <div className="mb-5"><StatsFilters available={accounts} scope={scope}
            rubrics={[...new Set(everything.map((t) => t.rubric_version))].sort((a, b) => a - b)} /></div>

          {scoped.some((t) => isBacktest(t.account)) && scoped.some((t) => isReal(t.account)) && (
            <p data-mixed-note className="mb-4 text-[12px]" style={{ color: 'rgb(var(--amber))' }}>
              Mixed: backtests are counted with real trades here — replay fills carry no fear, so read this total as a blend, not a live result.
            </p>
          )}
          {leftOutWorlds.some((x) => x.n > 0) && (
            <p data-missed-out className="mb-4 text-[12px]" style={{ color: 'var(--text-dim)' }}>
              {leftOutWorlds.reduce((a, x) => a + x.n, 0)} missed setup{leftOutWorlds.reduce((a, x) => a + x.n, 0) === 1 ? '' : 's'} left out of every number — they were not taken. They count in Missed trades &amp; hesitation below,{' '}
              <a className="underline underline-offset-2" href={`/stats?${new URLSearchParams({ account: 'Missed', ...filterParams }).toString()}`}>or on their own →</a>
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
            <LabProvider rows={packRows(lab)}>
            <div className="space-y-5">
              <KeyPoints s={summary} />
              <div className="flex items-center gap-3 pt-3" aria-hidden>
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>The details</span>
                <span className="h-px flex-1" style={{ background: 'var(--glass-stroke)' }} />
              </div>
              <IntegrityBanner issues={issues} />
              <EdgeHero m={realMetrics ?? metrics} scopeLabel={realMetrics ? 'real trades (live, demo, eval)' : scopeLabel} maturity={<MaturityRing m={mat} />} thresholds={thresholds}
                note={realMetrics ? `${replay.line} With the backtests: ${r2(metrics.expectancy)} a trade over ${metrics.n}.` : undefined} />
              <div id="focus" className="scroll-mt-4"><FocusCard f={focus} thumbs={thumbs} /></div>
              <EquityRisk curves={curves} rs={rs} m={metrics} split={split} adherence={adh} cone={cone} />

              <Collapsible id="eval" title="Eval odds" help="Monte Carlo of a prop evaluation from your own results: P(pass), P(bust) and the median days to pass. Recomputes under any Rule Lab filters you tick."
                summary="Will you pass? — 10,000 futures from your own trades">
                <WhenOpen><EvalPanel presets={evalPresets} /></WhenOpen>
              </Collapsible>

              <Collapsible id="quality" title="Setup quality" locked={lockNote('gradeCalibration', 'Grade calibration')}
                help="Do your grades mean anything? Grades locked before the outcome against those given after it, grade drift, and whether a score predicts R out of sample."
                summary={`${model?.wf ? `Learned score: ${mv ? VERDICT_LABEL[mv.level] : 'Too early'} (ρ ${model.wf.model.rho?.toFixed(2) ?? '—'} out of sample) · ` : ''}${quality.exposedN} of ${settled.length} grades hindsight-exposed${quality.spread.oneGrade ? ` · every pre-graded trade is ${quality.spread.oneGrade}` : ''}${quality.spread.items.some((i) => i.notFiltering) ? ` · ${quality.spread.items.filter((i) => i.notFiltering).length} checklist items not filtering` : ''}`}>
                <QualityPanel q={quality} model={model} thumbs={thumbs} weightsLocked={unlocked(mat, 'scoreModel') ? null : `Under 100 trades the learned weights barely leave yours (40 pseudo-trades of prior) — ${100 - settled.length} to go before they can visibly diverge.`} />
              </Collapsible>

              <Collapsible id="anatomy" title="Setup anatomy" locked={lockNote('explorer', 'The anatomy explorer')}
                help="Every level of every pre-trade field against the rest of your trades: shrunk toward your mean, an interval on each, Benjamini–Hochberg across the table. Only fields known before the entry are allowed in (the leakage firewall)."
                summary={strongest ? `${VERDICT_LABEL[strongest.verdict.level]}: ${strongest.label} = ${strongest.level} (${strongest.diff > 0 ? '+' : '−'}${Math.abs(strongest.diff).toFixed(2)}R vs the rest)` : `${visibleRows.length} rows, all Too early — about ${engine.nFor05R ?? '—'} trades per group to tell 0.5R apart`}>
                <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[11.5px]" data-window>
                  <span style={{ color: 'var(--text-faint)' }}>Window:</span>
                  {([['all', 'All history'], ['recent', 'Recent-weighted'], ['rubric', `Rubric ${latestRubric ?? ''} only`]] as const).map(([w, label]) => (
                    <a key={w} href={winHref(w)} className="rounded-full border px-2.5 py-0.5" style={pill(window === w)} data-window-option={w}>{label}</a>
                  ))}
                  <span style={{ color: 'var(--text-faint)' }}>· {engine.n} trades{window === 'recent' ? ' · half-life 60 trades' : ''}</span>
                </div>
                {btEligible && (
                  <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[11.5px]" data-bt-prior>
                    <span style={{ color: 'var(--text-faint)' }}>Backtests as a prior:</span>
                    <a href={`/stats?${new URLSearchParams({ account, ...filterParams, win: window }).toString()}`} className="rounded-full border px-2.5 py-0.5" style={pill(!btPrior)}>Off</a>
                    {[0.1, 0.3, 0.5].map((w) => (
                      <a key={w} href={`/stats?${new URLSearchParams({ account, ...filterParams, win: window, prior: 'backtest', btw: String(w) }).toString()}`} className="rounded-full border px-2.5 py-0.5" style={pill(btPrior && btWeight === w)} data-bt-weight={w}>
                        each replay = {w} of a live trade
                      </a>
                    ))}
                    <span style={{ color: 'var(--text-faint)' }}>· {backtests.length} backtests · replay is optimistic (no fear, hindsight), so it is discounted</span>
                  </div>
                )}
                <WhenOpen><AnatomyExplorer rows={visibleRows} mu={engine.explorer.mu} tests={engine.explorer.tests} hidden={engine.explorer.rows.length - visibleRows.length} thumbs={thumbsOf(visibleRows.flatMap((r) => r.tradeIds))} /></WhenOpen>
                <div className="mt-4" data-interactions>
                  <div className="mb-1 text-[11.5px]" style={{ color: 'var(--text-dim)' }}>Interactions and the volatility regime (tier 3)</div>
                  {engine.interactions ? (
                    <AnatomyExplorer rows={cut(engine.interactions.rows.filter((r) => !r.hidden))} mu={engine.interactions.mu} tests={engine.interactions.tests} hidden={engine.interactions.rows.filter((r) => r.hidden).length} thumbs={thumbsOf(engine.interactions.rows.flatMap((r) => r.tradeIds.slice(0, SHOWN)))} />
                  ) : <p className="text-[11.5px]" style={{ color: 'var(--text-faint)' }}>Liquidity event × killzone, closure score × target, entry × killzone, and wide vs tight stops — shrunk twice as hard, from 200 trades ({Math.max(0, 200 - settled.length)} to go).</p>}
                </div>
                {btGap.length > 0 && (
                  <div className="mt-4" data-bt-gap>
                    <div className="mb-1 text-[11.5px]" style={{ color: 'var(--text-dim)' }}>Backtest vs live — a big gap on the same setup means execution, not the setup</div>
                    <table className="w-full text-[12px]"><tbody>
                      {btGap.map((g) => (
                        <tr key={g.label} className="border-t" style={{ borderColor: 'var(--glass-stroke)' }}>
                          <td className="py-1.5">{g.label}</td>
                          <td className="text-right tabular-nums">live {g.live >= 0 ? '+' : '−'}{Math.abs(g.live).toFixed(2)}R ({g.liveN})</td>
                          <td className="text-right tabular-nums" style={{ color: 'var(--text-dim)' }}>replay {g.bt >= 0 ? '+' : '−'}{Math.abs(g.bt).toFixed(2)}R ({g.btN})</td>
                          <td className="text-right tabular-nums" style={{ color: 'var(--text-faint)' }}>gap {g.gap >= 0 ? '+' : '−'}{Math.abs(g.gap).toFixed(2)}R</td>
                        </tr>
                      ))}
                    </tbody></table>
                  </div>
                )}
              </Collapsible>

              <div id="similar" />
              <Collapsible id="similar-setups" title="Similar setups" open={params.similar != null} locked={lockNote('similar', 'Similar setups')}
                help="The nearest past trades to a setup, by Gower distance over the fields known before the entry. Shrunk mean and a win chance from a Beta posterior."
                summary={similar && similar.n ? `${simTarget ? thumbs[simTarget.id].day : ''}: ${similar.n} nearest, shrunk ${similar.shrunkR != null ? `${similar.shrunkR < 0 ? '−' : '+'}${Math.abs(similar.shrunkR).toFixed(2)}R` : '—'}` : 'Pick a trade to see its nearest past setups'}>
                <WhenOpen><SimilarLookup options={simOptions} picked={simTarget?.id ?? null} result={similar} thumbs={thumbsOf(similar?.neighbours.map((x) => x.id) ?? [])} /></WhenOpen>
              </Collapsible>

              <Collapsible id="execution" title="Execution" help="From the max-in-favour and max-heat taps: management leaks, entry leaks, stops that barely held, the cost of early breakeven, exit efficiency, planned vs achieved R:R. Outcome fields — diagnosis only."
                summary={exec.losersWithMfe ? `${exec.mgmtLeak.length} of ${exec.losersWithMfe} losers were 1R in favour first` : 'Fills in as you log max in favour and max heat'}>
                <ExecutionPanel e={exec} thumbs={thumbs} />
              </Collapsible>

              <Collapsible id="behaviour" title="Behaviour & state" help={BEHAVIOUR_HELP} summary={behaviourSummary(tilt, hesitation)}>
                <BehaviourCard tilt={tilt} hesitation={hesitation} />
              </Collapsible>

              <Collapsible id="rule-lab" title="Rule Lab" locked={lockNote('ruleLab', 'The Rule Lab')}
                help="What would have happened under a stricter rule. Expectancy with its interval, Δ against what you took, P(better) from a paired bootstrap, and the later half on its own from 60 trades."
                summary={bestLab ? `${bestLab.f.label}: P(better) ${Math.round((bestLab.r.pImprove ?? 0) * 100)}% — experiment only` : 'No filter clearly improves on what you took'}>
                <WhenOpen><RuleLabPanel each={Object.fromEntries(Object.entries(labEach).map(([k, v]) => [k, { ...v, curve: [] }]))} /></WhenOpen>
              </Collapsible>

              <Collapsible id="ledger" title="Mistake ledger" locked={lockNote('themeCosts', 'Mistake-theme costs')}
                help="Written after the outcome, so it diagnoses what went wrong — it never predicts what wins. Costs are shrunk toward zero with their 80% range."
                summary={ledger.themes[0] ? `${ledger.themes[0].title}: ${ledger.themes[0].n}× · ${ledger.themes[0].totalR < 0 ? '−' : '+'}${Math.abs(ledger.themes[0].totalR).toFixed(1)}R${ledger.repeated.length ? ` · ${ledger.repeated.length} lesson${ledger.repeated.length === 1 ? '' : 's'} not yet learned` : ''}` : `${ledger.losses.length} losses`}>
                <WhenOpen><LedgerView l={{ ...ledger, themes: cut(ledger.themes) }} thumbs={thumbsOf(ledger.themes.flatMap((t) => t.tradeIds.slice(0, SHOWN)))} /></WhenOpen>
              </Collapsible>

              <Collapsible id="missed" title="Missed trades & hesitation"
                help="Missed setups logged in real time only — hindsight entries are cherry-picked, so they are left out and counted. Skip quality compares the checklist scores and would-have-won rates of your skips and your takes."
                summary={missed.realtime ? `${missed.realtime} real-time skips · ${missed.wouldWin} would have won · ${missed.rLeft >= 0 ? '+' : '−'}${Math.abs(missed.rLeft).toFixed(1)}R left` : `No real-time missed setups${missed.hindsightLeftOut ? ` (${missed.hindsightLeftOut} hindsight left out)` : ''}`}>
                <MissedPanel m={missed} thumbs={thumbs} />
              </Collapsible>

              <Collapsible id="language" title="Journal language" summary={`Diagnostic, not predictive · ${lang.phrases.length} phrases${lang.suggestions.length ? ` · ${lang.suggestions.length} could be structured fields` : ''}`}
                help="Phrases from text written after the outcome, outcome words removed, shrunk and corrected. They describe how you talk about trades; they can never say what wins.">
                <WhenOpen><LanguagePanel l={{ ...lang, phrases: cut(lang.phrases) }} thumbs={thumbsOf(lang.phrases.flatMap((p) => p.tradeIds.slice(0, SHOWN)))} /></WhenOpen>
              </Collapsible>

              <Collapsible id="health" title="Engine health"
                help="The engine grades itself: every claim above Too early is recorded and re-checked on the next 30 trades logged after it. If its claims don't hold, its thresholds rise."
                summary={`${claims.filter((c) => c.status !== 'open').length} claims checked · ${claims.filter((c) => c.status === 'open').length} waiting${thresholdChanges.length ? ' · thresholds raised' : ''} · tier ${mat.tier}`}>
                <HealthPanel claims={claims} rates={hitRates(claims)} brier={brierScore} thresholds={thresholds} base={DEFAULT_THRESHOLDS} changes={thresholdChanges}
                  completeness={preCompleteness} mat={mat} blind={blind} labelOf={(f) => fieldDef(f)?.label ?? f} />
              </Collapsible>

              <p className="pt-1 text-center text-[11px]" style={{ color: 'var(--text-faint)' }}>
                {preOnly ? `Only trades graded before the outcome — ${trades.length} of ${scoped.length}. ` : ''}
                {agg.passed > 0 ? `${agg.passed} passed setup${agg.passed === 1 ? '' : 's'} journalled, never counted. ` : ''}
                {trial ? trialLine(TRIAL_RUBRIC!, trial) : ''}
              </p>
            </div>
            </LabProvider>
          )}
        </div>
      </div>
    </div>
  );
}

