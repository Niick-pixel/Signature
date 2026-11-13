import 'server-only';
import { replayStats } from '../lib/replayStats';
import { listReplayDays } from './replay';
/**
 * Everything the Stats page computes, in one place: the engine's outputs for a
 * scope (accounts, period, filters from the URL). The page — and from phase 2
 * the dashboard's widgets — only read this. No statistics are computed in a
 * view; they come from lib/edge, here.
 *
 * Side effect, as before: the insight ledger's claims for this scope are
 * re-checked and new ones recorded (lib/edge/claims), so the engine grades
 * itself as the page is opened.
 */
import { decisionStats } from '@/lib/decisionStats';
import { listTrades } from './trades';
import { countsInStats, isBacktest, isDated, isHypothetical, isSeparate } from '../lib/domain';
import { accountsInUse, aggregate, deliveryOnlyVerdict, equityCurves, pnlOf, preGradedOnly } from '../lib/stats';
import { edgeInputs } from './edgeInputs';
import { planBreaks } from '../lib/review';
import { edgeMetrics, adherence } from '../lib/edge/metrics';
import { coverSplit } from '../lib/edge/flaws';
import { hesitations, tradeStates, withState } from '../lib/edge/state';
import { tiltIndex } from '../lib/edge/tilt';
import { runEngine } from '../lib/edge/engine';
import { maturity, unlocked } from '../lib/edge/maturity';
import { integrity } from '../lib/edge/integrity';
import { weeklyFocus } from '../lib/edge/focus';
import { ledgerV2 } from '../lib/edge/ledger';
import { compare } from '../lib/edge/compare';
import { equityCone } from '../lib/edge/montecarlo';
import type { Thumb } from '../components/stats/EdgeUI';
import { LAB_FILTERS, MAX_TESTABLE, labResult, labRows } from '../lib/edge/ruleLab';
import { listPropAccounts } from './prop';
import { scoreModel, skillVerdict } from '../lib/edge/scoreModel';
import { setupQuality } from '../lib/edge/quality';
import { execution } from '../lib/edge/execution';
import { similarSetups } from '../lib/edge/similar';
import { language } from '../lib/edge/text';
import { missedStats } from '../lib/edge/missed';
import { BACKTEST_WEIGHT } from '../lib/edge/explorer';
import { summarize } from '../lib/edge/summary';
import { addInsight, listBlindGrades, listInsights, settleInsight } from './edge';
import { listPredictions } from './predictions';
import { brier, newClaims, recheck, withConfirmed, type StoredClaim } from '../lib/edge/claims';
import { blindCounter, retestPairs, weightedKappa } from '../lib/edge/blind';
import { PREDICTORS, sourceOf } from '../lib/edge/fields';
import { localDay } from '../lib/day';
import { PRESETS, type PropRules } from '../lib/prop';
import type { EvalPreset } from '../components/stats/Lab';
import { accountParam, applyStatsScope, measuredTrades, parseStatsScope } from '../lib/statsScope';
import { TRIAL_RUBRIC } from '../lib/rubric';
import { backtestGap } from '../lib/edge/views';
import { listPreps } from './prep';
import { biasSplit, scenarioSplit } from '../lib/planMatch';

export type StatsParams = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function statsEngine(params: StatsParams, rememberedAccount: string | undefined) {
  // Hindsight — a Missed trade not written down before the move — never
  // enters a number (lib/domain countsInStats). Counted, and said, below.
  const everything = listTrades();
  const all = everything.filter(countsInStats);
  const hindsight = everything.length - all.length;
  const accounts = accountsInUse(everything);

  // Accounts, period, session and direction, from the URL (lib/statsScope).
  // With no account asked for, the remembered choice; with none, the busiest
  // real account. "All accounts" is every account, Backtest and Missed too.
  const scope = parseStatsScope(params, accounts.map((a) => a.account), rememberedAccount);
  const single = scope.accounts.length === 1 ? scope.accounts[0] : null;
  // The URL value for this selection, carried by every link on the page.
  const account = accountParam(scope.accounts, accounts.map((a) => a.account));
  const inAccounts = measuredTrades(all.filter((t) => scope.accounts.includes(t.account)), scope).inView;
  // Missed setups never join taken trades in a number; backtests stay when you select them (the page says it is mixed).
  const { inView: scoped, leftOut: leftOutWorlds } = measuredTrades(applyStatsScope(all, scope), scope);
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
  const filtered = (preOnly ? preGradedOnly(scoped) : scoped).filter((t) => !noQuick || !t.quick_log);
  // ?last=N (a dashboard widget's "last N trades"): only the N most recent, in the order they happened.
  const lastN = Number(one(params.last));
  const trades = Number.isInteger(lastN) && lastN > 0
    ? [...filtered].sort((a, b) => a.date.localeCompare(b.date)).slice(-lastN)
    : filtered;
  // The trial counts the skipped setups logged in Missed as well — on any
  // account's page, not only on Missed's (where they are already the selection).
  const sameFilters = (list: typeof all) => (preOnly ? preGradedOnly(list) : list).filter((t) => !noQuick || !t.quick_log);
  const trialVerdict = deliveryOnlyVerdict(sameFilters(trades),
    // Not on Backtest's page: a replay's verdict is its own.
    single && isSeparate(single) ? [] : sameFilters(all.filter((t) => isHypothetical(t.account))));
  const agg = aggregate(trades);
  const pageQuery = new URLSearchParams({ account, ...filterParams }).toString();

  // One definition of adherence: nothing broken in the rule book, trade and day rules (lib/review planBreaks).
  // The engine's inputs, shared with the Flaw Deck (db/edgeInputs), so both read every trade the same way.
  const ei = edgeInputs();
  const { ctxFor, cfg, breaks, eras } = ei;
  const curves = equityCurves(trades, (t) => planBreaks(t, breaks, cfg, eras).length === 0);
  // The canonical metrics (lib/edge/metrics), over settled trades in the order they happened.
  const settled = trades.filter((t) => t.outcome !== 'Not taken' && t.r_multiple != null).sort((a, b) => a.date.localeCompare(b.date));
  const metrics = edgeMetrics(settled.map((t) => ({ r: t.r_multiple as number, money: pnlOf(t) })));
  // Mostly replay? Then the real result leads, the hero and the one-liner both (lib/edge/flaws coverSplit).
  const replay = coverSplit(settled);
  const realSettled = replay.mostlyReplay ? settled.filter((t) => sourceOf(t.account) !== 'backtest') : [];
  const realMetrics = replay.mostlyReplay ? edgeMetrics(realSettled.map((t) => ({ r: t.r_multiple as number, money: pnlOf(t) }))) : null;
  const breaksOf = ei.breaksOf;
  // Behaviour and state: computed from the order of the trades (lib/edge/state, tilt).
  const states = tradeStates(settled, ctxFor);
  const stateful = withState(settled, states);
  const tilt = tiltIndex(settled, states, breaksOf);
  const hesitation = hesitations(all.filter((t) => scope.accounts.includes(t.account) || isHypothetical(t.account)));
  // Where the trades in the numbers came from, so a blended total is never read as a live one.
  const mix = (['live', 'demo', 'eval', 'backtest', 'missed'] as const)
    .map((s) => [s, settled.filter((t) => sourceOf(t.account) === s).length] as const).filter(([, n]) => n > 0);
  const scopeLabel = `${scope.all ? 'all accounts' : scope.accounts.map((a) => (isBacktest(a) ? 'Backtest' : a)).join(' + ')}${mix.length > 1 ? ` · ${mix.map(([s, n]) => `${s} ${n}`).join(' · ')}` : ''}`;

  // The Edge Engine (lib/edge): window, maturity, integrity, focus, the explorer, the ledger.
  const mat = maturity(settled.length);
  const winParam = one(params.win);
  // Tier 2 and up: recency weighting on by default.
  const window = winParam === 'recent' || winParam === 'rubric' || winParam === 'all' ? winParam : unlocked(mat, 'recencyDefault') ? 'recent' : 'all';
  const latestRubric = settled.length ? Math.max(...settled.map((t) => t.rubric_version ?? 0)) : undefined;
  // Backtests as a discounted prior (§5.13): on real accounts, when backtests exist and you turn it on.
  const backtests = all.filter((t) => isBacktest(t.account) && t.r_multiple != null && t.outcome !== 'Not taken');
  const btEligible = backtests.length > 0 && !scope.accounts.some((a) => isBacktest(a));
  const btWeight = Number(one(params.btw)) || BACKTEST_WEIGHT;
  const btPrior = btEligible && one(params.prior) === 'backtest';
  // The insight ledger (lib/edge/claims): its record sets the thresholds every verdict uses.
  const { claimsBefore, thresholds, thresholdChanges } = ei;
  const engine = runEngine(settled, { window, rubric: latestRubric, thresholds, backtest: btPrior ? { trades: backtests, weight: btWeight } : undefined });
  const scopeKey = `${account}|${new URLSearchParams(filterParams).toString()}|${window}${btPrior ? `|bt${btWeight}` : ''}`;
  const explorerRows = withConfirmed(engine.explorer.rows, scopeKey, claimsBefore, thresholds);
  // Re-check this scope's open claims on the trades logged after each, then record new ones.
  for (const c of claimsBefore.filter((x) => x.scope === scopeKey && x.status === 'open')) {
    // The trades in view already carry their state (stateful); the claim is tested on those logged after it.
    const res = recheck(c, stateful.filter((t) => t.created_at > c.created_at));
    if (res) settleInsight(c.id, { status: res.status, eval_n: res.n, eval_size: res.size, eval_p: res.p });
  }
  const lastLogged = settled.reduce((m, t) => (t.created_at > m ? t.created_at : m), '');
  for (const c of newClaims(explorerRows, scopeKey, settled.length, lastLogged, claimsBefore)) addInsight(c);
  const claims = listInsights() as StoredClaim[];
  // Backtest vs live, level by level: a big gap means execution, not the setup.
  const btEngine = btEligible ? runEngine(backtests, { window: 'all' }) : null;
  const btGap = btEngine ? backtestGap(engine.explorer.rows, btEngine.explorer.rows) : [];
  const issues = integrity(settled, metrics, { noR: trades.filter((t) => t.outcome !== 'Not taken' && t.status === 'Settled' && t.r_multiple == null).length });
  const themeWords = ei.themeWords;
  const focus = weeklyFocus(stateful, breaksOf, { sd: metrics.sd, words: themeWords, thresholds });
  const ledger = ledgerV2(settled, breaksOf, { words: themeWords, thresholds });
  // Engine health: Brier score of stored predictions, blind re-grade counter and consistency.
  const brierScore = brier(listPredictions(), everything);
  const blindGrades = listBlindGrades();
  const blindK = weightedKappa(retestPairs(blindGrades));
  const blind = { ...blindCounter(blindGrades, localDay()), kappa: blindK.kappa, kappaN: blindK.n };
  const preCompleteness = engine.completeness.filter((c) => PREDICTORS.some((f) => f.key === c.key)).sort((a, b) => b.filled - a.filled);
  const lang = language(settled);
  const missed = missedStats(everything.filter((t) => scope.accounts.includes(t.account) || isHypothetical(t.account)));
  const rs = settled.map((t) => t.r_multiple as number);
  const cone = equityCone(rs);
  const kept = settled.filter((t) => breaksOf(t).length === 0);
  const split = compare(kept.map((t) => t.r_multiple as number), settled.filter((t) => breaksOf(t).length > 0).map((t) => t.r_multiple as number));
  const adh = adherence(settled, breaksOf);
  const thumbs: Record<string, Thumb> = Object.fromEntries(settled.map((t) => [t.id, {
    id: t.id, shot: t.screenshot_path || null, r: t.r_multiple, day: isBacktest(t.account) ? (t.session_index ? `Session ${t.session_index}` : 'Backtest') : t.date.slice(0, 10),
  }]));
  // Rule Lab rows (lib/edge/ruleLab), and the best single filter as this week's experiment when it is at least a hint.
  const lab = labRows(stateful, breaksOf);
  const labEach = Object.fromEntries(LAB_FILTERS.map((f) => [f.id, labResult(lab, [f.id], { resamples: 1000 })]));
  const bestLab = LAB_FILTERS.map((f) => ({ f, r: labEach[f.id] }))
    .filter((x) => x.r.pImprove != null && x.r.pImprove >= 0.75 && x.r.kept >= lab.length / 2 && x.r.testN != null && x.r.testN <= MAX_TESTABLE).sort((a, b) => (b.r.pImprove ?? 0) - (a.r.pImprove ?? 0))[0];
  if (bestLab) focus.experiment = { text: `Rule Lab: ${bestLab.f.label.toLowerCase()}.`, from: `the Rule Lab (P(better) ${Math.round((bestLab.r.pImprove ?? 0) * 100)}%)`, n: bestLab.r.testN! };
  // Eval presets: your prop accounts first, then the common evaluations.
  const evalRules = (r: PropRules) => ({ start: r.start_balance, target: r.profit_target ?? 0, maxDrawdown: r.max_drawdown, drawdown: r.drawdown_type, trailLock: r.trail_lock, dailyLoss: r.daily_loss, minDays: r.min_days });
  const evalPresets: EvalPreset[] = [
    ...listPropAccounts().filter((a) => a.status === 'active' && a.profit_target).map((a) => ({ key: `acct:${a.id}`, label: `${a.firm} — ${a.label || a.plan}`, rules: evalRules(a) })),
    ...PRESETS.filter((p) => p.phase === 'eval' && p.rules.profit_target).map((p) => ({ key: `preset:${p.firm}:${p.plan}`, label: `${p.firm} ${p.plan}`, rules: evalRules(p.rules) })),
  ];
  // Setup quality, the learned score (lib/edge/scoreModel), similar setups, execution.
  const quality = setupQuality(settled);
  const model = scoreModel(settled, { halfLife: window === 'recent' ? 60 : null });
  const mv = model?.wf ? skillVerdict(model.wf.model, model.wf.n) : null;
  const simId = one(params.similar) ?? settled[settled.length - 1]?.id ?? null;
  const simTarget = settled.find((t) => t.id === simId) ?? null;
  const similar = simTarget ? similarSetups(simTarget, settled.filter((t) => t.id !== simTarget.id && t.date <= simTarget.date)) : null;
  const simOptions = [...settled].reverse().slice(0, 80).map((t) => ({ id: t.id, label: `${thumbs[t.id].day} · ${t.setup_type} ${t.direction === 'Long' ? '↗' : '↘'} · ${t.grade_letter ?? ''}` }));
  const exec = execution(settled);
  // The top of the page, in plain words (lib/edge/summary).
  const fill = (k: string) => { const c = engine.completeness.find((x) => x.key === k); return c && c.n ? c.filled / c.n : 0; };
  const missingCore = [['entry_method', 'entry method'], ['candle_strength', 'inversion candle'], ['planned_rr', 'planned R:R']].filter(([k]) => fill(k) < 0.5).map(([, l]) => l);
  const summary = summarize({ m: metrics, focus, split, adherence: adh, cone, mat, missingCore, replay: realMetrics ? { line: replay.line!, real: realMetrics } : null });
  // What goes to the browser: each row shows at most 12 charts, so only those ids travel, with
  // only their thumbnails — not every trade's id and thumbnail in every row.
  const SHOWN = 12;
  const cut = <T extends { tradeIds: string[] }>(xs: readonly T[]) => xs.map((x) => ({ ...x, tradeIds: x.tradeIds.slice(0, SHOWN) }));
  const thumbsOf = (ids: Iterable<string>) => { const o: Record<string, Thumb> = {}; for (const id of ids) if (thumbs[id]) o[id] = thumbs[id]; return o; };
  const visibleRows = cut(explorerRows.filter((r) => !r.hidden));
  const strongest = visibleRows.filter((r) => r.verdict.level !== 'too-early').sort((a, b) => b.verdict.p - a.verdict.p)[0];
  const winHref = (w: string) => `/stats?${new URLSearchParams({ account, ...filterParams, win: w }).toString()}`;
  const lockNote = (f: Parameters<typeof unlocked>[1], what: string) => (unlocked(mat, f) ? null
    : `${what} unlocks at 30 trades (${30 - settled.length} to go). Shown as a preview — every row reads Too early until then.`);
  const trial = TRIAL_RUBRIC != null ? trialVerdict : null;

  // What each of the morning's plans made, and trading with or against the written bias (lib/planMatch, 045).
  const prepByDay = new Map(listPreps().map((x) => [x.day, x.data] as const));
  const plans = { scenarios: scenarioSplit(settled, prepByDay), bias: biasSplit(settled, prepByDay) };

  // Rubric v2 (4 rows): its own numbers, never mixed with the checklist's scale (lib/decisionStats).
  const decisions = decisionStats(trades);
  // Replay plans (048), backtests only; amended days counted apart (lib/replayStats).
  const replayPlans = replayStats(listReplayDays(), trades);

  return {
    plans,
    decisions,
    replayPlans,
    scoped,
    leftOutWorlds,
    ctxFor,
    cfg,
    breaks,
    eras,
    claimsBefore,
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
    inAccounts,
    undatedOut,
    filterParams,
    preOnly,
    noQuick,
    quickCount,
    trades,
    sameFilters,
    trialVerdict,
    agg,
    pageQuery,
    ei,
    curves,
    settled,
    metrics,
    replay,
    realSettled,
    realMetrics,
    breaksOf,
    states,
    stateful,
    tilt,
    hesitation,
    mix,
    scopeLabel,
    mat,
    window,
    latestRubric,
    backtests,
    btEligible,
    btWeight,
    btPrior,
    engine,
    scopeKey,
    explorerRows,
    claims,
    btEngine,
    btGap,
    issues,
    themeWords,
    focus,
    ledger,
    brierScore,
    blindGrades,
    blindK,
    blind,
    preCompleteness,
    lang,
    missed,
    rs,
    cone,
    kept,
    split,
    adh,
    thumbs,
    lab,
    labEach,
    bestLab,
    evalRules,
    evalPresets,
    quality,
    model,
    mv,
    simId,
    simTarget,
    similar,
    simOptions,
    exec,
    fill,
    missingCore,
    summary,
    SHOWN,
    cut,
    thumbsOf,
    visibleRows,
    strongest,
    trial,
  };
}

export type StatsEngine = ReturnType<typeof statsEngine>;
