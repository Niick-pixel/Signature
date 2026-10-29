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
import { BEHAVIOUR_HELP, BehaviourCard, behaviourSummary } from '@/components/stats/BehaviourCard';
import { hesitations, tradeStates, withState } from '@/lib/edge/state';
import { tiltIndex } from '@/lib/edge/tilt';
import { runEngine } from '@/lib/edge/engine';
import { maturity, unlocked } from '@/lib/edge/maturity';
import { integrity } from '@/lib/edge/integrity';
import { weeklyFocus } from '@/lib/edge/focus';
import { ledgerV2 } from '@/lib/edge/ledger';
import { compare } from '@/lib/edge/compare';
import { adherence } from '@/lib/edge/metrics';
import { equityCone } from '@/lib/edge/montecarlo';
import { VERDICT_LABEL } from '@/lib/edge/verdict';
import { Collapsible, type Thumb } from '@/components/stats/EdgeUI';
import { IntegrityBanner } from '@/components/stats/IntegrityBanner';
import { MaturityRing } from '@/components/stats/MaturityRing';
import { FocusCard } from '@/components/stats/FocusCard';
import { EquityRisk } from '@/components/stats/EquityRisk';
import { AnatomyExplorer } from '@/components/stats/AnatomyExplorer';
import { LedgerView } from '@/components/stats/LedgerView';
import { WordsTable } from '@/components/stats/SuccessView';
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

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
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
  const breaksOf = (t: (typeof settled)[number]) => planBreaks(t, breaks, cfg, eras);
  // Behaviour and state: computed from the order of the trades (lib/edge/state, tilt).
  const states = tradeStates(settled, ctxFor);
  const stateful = withState(settled, states);
  const tilt = tiltIndex(settled, states, breaksOf);
  const hesitation = hesitations(all.filter((t) => scope.accounts.includes(t.account) || isHypothetical(t.account)));
  const scopeLabel = scope.all ? 'all accounts' : scope.accounts.map((a) => (isBacktest(a) ? 'Backtest' : a)).join(' + ');

  // The Edge Engine (lib/edge): window, maturity, integrity, focus, the explorer, the ledger.
  const mat = maturity(settled.length);
  const winParam = one(params.win);
  // Tier 2 and up: recency weighting on by default.
  const window = winParam === 'recent' || winParam === 'rubric' || winParam === 'all' ? winParam : unlocked(mat, 'recencyDefault') ? 'recent' : 'all';
  const latestRubric = settled.length ? Math.max(...settled.map((t) => t.rubric_version ?? 0)) : undefined;
  const engine = runEngine(settled, { window, rubric: latestRubric });
  const issues = integrity(settled, metrics, { noR: trades.filter((t) => t.outcome !== 'Not taken' && t.status === 'Settled' && t.r_multiple == null).length });
  const focus = weeklyFocus(stateful, breaksOf, { sd: metrics.sd });
  const ledger = ledgerV2(settled, breaksOf);
  const rs = settled.map((t) => t.r_multiple as number);
  const cone = equityCone(rs);
  const kept = settled.filter((t) => breaksOf(t).length === 0);
  const split = compare(kept.map((t) => t.r_multiple as number), settled.filter((t) => breaksOf(t).length > 0).map((t) => t.r_multiple as number));
  const adh = adherence(settled, breaksOf);
  const thumbs: Record<string, Thumb> = Object.fromEntries(settled.map((t) => [t.id, {
    id: t.id, shot: t.screenshot_path || null, r: t.r_multiple, day: isBacktest(t.account) ? (t.session_index ? `Session ${t.session_index}` : 'Backtest') : t.date.slice(0, 10),
  }]));
  const visibleRows = engine.explorer.rows.filter((r) => !r.hidden);
  const strongest = visibleRows.filter((r) => r.verdict.level !== 'too-early').sort((a, b) => b.verdict.p - a.verdict.p)[0];
  const winHref = (w: string) => `/stats?${new URLSearchParams({ account, ...filterParams, win: w }).toString()}`;
  const lockNote = (f: Parameters<typeof unlocked>[1], what: string) => (unlocked(mat, f) ? null
    : `${what} unlocks at 30 trades (${30 - settled.length} to go). Shown as a preview — every row reads Too early until then.`);
  // Your words (lib/wordPatterns): diagnostic only, until the language rebuild (milestone 9).
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
              <IntegrityBanner issues={issues} />
              <EdgeHero m={metrics} scopeLabel={scopeLabel} maturity={<MaturityRing m={mat} />} />
              <FocusCard f={focus} thumbs={thumbs} />
              <EquityRisk curves={curves} rs={rs} m={metrics} split={split} adherence={adh} cone={cone} />

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
                <AnatomyExplorer rows={visibleRows} mu={engine.explorer.mu} tests={engine.explorer.tests} hidden={engine.explorer.rows.length - visibleRows.length} thumbs={thumbs} />
              </Collapsible>

              <Collapsible id="behaviour" title="Behaviour & state" help={BEHAVIOUR_HELP} summary={behaviourSummary(tilt, hesitation)}>
                <BehaviourCard tilt={tilt} hesitation={hesitation} />
              </Collapsible>

              <Collapsible id="ledger" title="Mistake ledger" locked={lockNote('themeCosts', 'Mistake-theme costs')}
                help="Written after the outcome, so it diagnoses what went wrong — it never predicts what wins. Costs are shrunk toward zero with their 80% range."
                summary={ledger.themes[0] ? `${ledger.themes[0].title}: ${ledger.themes[0].n}× · ${ledger.themes[0].totalR < 0 ? '−' : '+'}${Math.abs(ledger.themes[0].totalR).toFixed(1)}R${ledger.repeated.length ? ` · ${ledger.repeated.length} lesson${ledger.repeated.length === 1 ? '' : 's'} not yet learned` : ''}` : `${ledger.losses.length} losses`}>
                <LedgerView l={ledger} thumbs={thumbs} />
              </Collapsible>

              <Collapsible id="language" title="Journal language" summary="Diagnostic, not predictive — written after the result"
                help="Words from text written after the outcome. They describe how you talk about trades; they can never say what wins.">
                <WordsTable map={words} trades={wordTrades} />
              </Collapsible>

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

