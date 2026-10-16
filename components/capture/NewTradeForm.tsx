'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Collapse } from '@/components/ui/Collapse';
import {
  ACCOUNT_VALUES, BACKTEST, BACKTEST_REASON, accountLabel as accountName, SHOT_SLOTS, accountOptions, isBacktest, isHypothetical, CHECKLIST_KEYS, CONTEXT_FLAGS, WORKED_TAGS, MISTAKE_TAGS, tagOptions, type WorkedTag, MARKET_TAGS, type MarketTag, DIRECTIONS, HTF_BIASES, INSTRUMENTS,
  OUTCOMES, PREMIUM_DISCOUNTS, REASONS, SESSIONS, SETUP_TYPES,
  SKIP_REASONS, TRADE_STATUSES, TARGET_WHY, WEAK_TARGET, WEAK_TARGET_WARNING, targetTypeOptions,
  type Account, type ChecklistAnswer, type ChecklistKey, type ContextFlag,
  type Direction, type HtfBias,
  type Instrument, type MistakeTag, type Outcome, type PremiumDiscount, type Regrade,
  type SkipReason, type Reason, type Session, type SetupType, type TargetType,
  type SweepTier, type TradeStatus, type Tri,
  MGMT_PLANS, MGMT_PLAN_LABEL, MGMT_PLAN_WHY, PARTIAL_LEVELS, type MgmtPlan,
} from '@/lib/domain';
import { REGRADE_HINT, regradeOptions } from '@/lib/grade';
import { CURRENT_RUBRIC, GATES_SINCE, MODEL_GATE_MESSAGE, gradeUnder } from '@/lib/rubric';
import { macroWindowFor } from '@/lib/macro';
import { press, spring, springSoft, riseIn, exitQuick } from '@/lib/motion';
import { reasonAccent } from '@/lib/layout';
import { MIN_EXPLANATION, MIN_LESSON, type Trade } from '@/lib/types';

const LAST_ACCOUNT_KEY = 'signature.lastAccount';

/** The questions that start with an answer already in them. */
const DEFAULTED = [
  'outcome', 'session', 'instrument', 'direction', 'setupType', 'htfBias', 'premiumDiscount', 'targetType',
  'sweepTier', 'status',
] as const;
/*
  No biased defaults: these start empty on a new trade and must be chosen —
  a pre-filled Win, Settled or EQH/EQL is an answer nobody gave. Instrument
  (NQ) and the sweep tier keep theirs: neither leans toward a result.
*/
const REQUIRED = ['outcome', 'session', 'direction', 'setupType', 'htfBias', 'premiumDiscount', 'targetType', 'status'] as const;
type DefaultedField = (typeof DEFAULTED)[number];
const DEFAULTED_LABEL: Record<DefaultedField, string> = {
  outcome: 'How it ended', session: 'Session', instrument: 'Instrument', direction: 'Direction',
  setupType: 'Setup type', htfBias: 'HTF bias', premiumDiscount: 'Premium / discount', targetType: 'Target type',
  sweepTier: 'Sweep', status: 'Stage',
};
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Disclosure';
import { Field, Input } from '@/components/ui/Field';
import { GradeBadge } from '@/components/ui/GradeBadge';
import { Segmented } from '@/components/ui/Segmented';
import { Select } from '@/components/ui/Select';
import { OUTCOME_COLOR } from '@/components/whiteboard/TradeNode';
import { TogglePill } from '@/components/ui/TogglePill';
import { TriState } from '@/components/ui/TriState';
import { TagPicker } from '@/components/ui/TagPicker';
import { Checklist } from './Checklist';
import { TrialLiquidity } from './TrialLiquidity';
import { clearDraft, readDraft, writeDraft } from '@/lib/draft';
import { ExplanationField } from './ExplanationField';
import { ScreenshotDropzone } from './ScreenshotDropzone';
import { ShotSlots, type SlotFiles } from './ShotSlots';
import { PastLessons } from './PastLessons';
import { dialogIsOpen } from '@/components/ui/Overlay';
import type { PastLesson } from '@/lib/lessons';
import { navigate } from '@/lib/nav';
import { CommitmentSheet } from '@/components/path/CommitmentSheet';
import { PathBanner, usePathSummary } from '@/components/path/PathBanner';
import type { HeldCommitment } from '@/lib/path';
import {
  BeTriggerField, ConfidenceNotice, LateNotice, Notice, TargetCheckBlock, movedStopSuggested, useGuardContext,
  type TargetCheckState,
} from './Guardrails';
import type { BeTrigger } from '@/lib/domain';
import type { TradeOverride } from '@/lib/types';

/** `datetime-local` wants 'YYYY-MM-DDTHH:mm' in local time, not an ISO string. */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function NewTradeForm({ trade, pastLessons = {}, backtestLessons = {} }: {
  trade?: Trade;
  /** The latest lessons per setup type — worked out on the server, see lib/lessons. */
  pastLessons?: Record<string, PastLesson[]>;
  /** The same, from backtests — shown while logging one. */
  backtestLessons?: Record<string, PastLesson[]>;
}) {
  const editing = Boolean(trade);
  // Editing replaces the one stored chart; a new trade fills labelled slots.
  const [file, setFile] = useState<File | null>(null);
  const [slots, setSlots] = useState<SlotFiles>({});

  /*
    Answers that start on a default. Each one's label stays lit until an
    option is picked — the default itself counts — so a pre-filled "Win" or
    "With bias" is never saved without being looked at. An edit starts with
    everything confirmed: those answers were given when the trade was logged.
  */
  const [confirmed, setConfirmed] = useState<DefaultedField[]>(() => (trade ? [...DEFAULTED] : []));
  const confirm = (field: DefaultedField) =>
    setConfirmed((prev) => (prev.includes(field) ? prev : [...prev, field]));
  const pending = (field: DefaultedField) => !confirmed.includes(field);
  const firstSlot = SHOT_SLOTS.find((s) => slots[s]) ?? null;
  const chart = trade ? file : (firstSlot ? slots[firstSlot]! : null);
  const [reason, setReason] = useState<Reason | null>(trade?.reason ?? null);
  const [explanation, setExplanation] = useState(trade?.explanation ?? '');

  // One record rather than a useState per flag — there are eleven now, and a
  // new one should cost a line in CONTEXT_GROUPS, not four scattered edits.
  const [context, setContext] = useState<Record<ContextFlag, boolean>>(() =>
    Object.fromEntries(
      CONTEXT_FLAGS.map((f) => [f, trade ? Boolean(trade[f]) : false]),
    ) as Record<ContextFlag, boolean>,
  );

  /*
    Tri-state, and `trade[k] ?? null` rather than Boolean(): a box saved as
    "did not apply" has to come back as N/A, not silently as a miss.
  */
  const [checks, setChecks] = useState<Record<ChecklistKey, ChecklistAnswer>>(() =>
    Object.fromEntries(
      CHECKLIST_KEYS.map((k) => [k, trade ? trade[k] ?? null : false]),
    ) as Record<ChecklistKey, ChecklistAnswer>,
  );
  const setCheck = (key: ChecklistKey, value: ChecklistAnswer) =>
    setChecks((prev) => ({ ...prev, [key]: value }));
  /*
    Starts on NONE, the answer that claims nothing — and lit, like every other
    default, until one is picked. An old trade that never answered it opens
    with nothing picked rather than a guess.
  */
  const [sweepTier, setSweepTier] = useState<SweepTier | null>(trade ? trade.sweep_tier : 'none');
  /*
    Rubric 4 (trial): the liquidity event, named. Empty and unset by default —
    nothing here claims a level or a confirmation nobody picked.
  */
  const [sweepLevel, setSweepLevel] = useState(trade?.sweep_level ?? '');
  const [futuresConfirmed, setFuturesConfirmed] = useState<Tri>(trade?.sweep_futures_confirmed ?? null);
  const [htfDelivery, setHtfDelivery] = useState(trade?.htf_delivery ?? '');

  // Tri-state, starting unanswered. This used to default to `true`, so every
  // trade ever saved claimed full rule adherence whether or not the question
  // had been looked at. Nothing on this form starts in the affirmative now.
  const [followedRules, setFollowedRules] = useState<Tri>(trade?.followed_rules ?? null);
  const [regrade, setRegrade] = useState<Regrade | null>(trade?.regrade ?? null);
  const [mistakeTags, setMistakeTags] = useState<MistakeTag[]>(trade?.mistake_tags ?? []);
  const [marketTags, setMarketTags] = useState<MarketTag[]>(trade?.market_tags ?? []);
  const [tagSide, setTagSide] = useState<'me' | 'market'>('me');
  const [workedTags, setWorkedTags] = useState<WorkedTag[]>(trade?.worked_tags ?? []);
  const [account, setAccount] = useState<Account>(trade?.account ?? 'Live');
  const [accountLabel, setAccountLabel] = useState(trade?.account_label ?? '');
  const [status, setStatus] = useState<TradeStatus>(trade?.status ?? 'Settled');
  const [pnlDollars, setPnlDollars] = useState(trade?.pnl_dollars?.toString() ?? '');
  const [reached1R, setReached1R] = useState<Tri>(trade?.reached_1r ?? null);
  // Targets and management (021): which targets get hit, and under which plan.
  const [targetHit, setTargetHit] = useState<Tri>(trade?.target_hit ?? null);
  const [targetFresh, setTargetFresh] = useState<Tri>(trade?.target_fresh ?? null);
  const [oppositeTaken, setOppositeTaken] = useState<Tri>(trade?.opposite_taken ?? null);
  const [mgmtPlan, setMgmtPlan] = useState<MgmtPlan | null>(trade?.mgmt_plan ?? null);
  const [partialAt, setPartialAt] = useState<string | null>(trade?.partial_at ?? null);
  const [mfeR, setMfeR] = useState(trade?.mfe_r?.toString() ?? '');
  const [confidence, setConfidence] = useState<number | null>(trade?.confidence_at_entry ?? null);
  // Guardrails (026).
  const [chartDate, setChartDate] = useState(trade?.chart_date ?? '');
  const [beTrigger, setBeTrigger] = useState<BeTrigger | null>(trade?.be_trigger ?? null);
  const [tc, setTc] = useState<TargetCheckState>(() => ({
    targetType: null,
    nearestType: trade?.nearest_liquidity_type ?? null,
    nearestPrice: trade?.nearest_liquidity_price?.toString() ?? '',
    swings: trade?.opposing_swings_between ?? null,
    entryPrice: trade?.entry_price?.toString() ?? '',
    stopPrice: trade?.stop_loss?.toString() ?? '',
    targetPrice: trade?.take_profit?.toString() ?? '',
    stopPoints: '',
    eqhl: trade?.eqhl_checks ?? { touches: false, untested: false, in_range: false },
  }));
  const setTcPart = (p: Partial<TargetCheckState>) => setTc((prev) => ({ ...prev, ...p }));
  /*
    A new backtest is graded in two steps: setup, checklist and confidence,
    then "Lock grade" saves it as Planned — and only then do the outcome, R
    and the result chart open. lockedId is that saved trade. skipLock is the
    escape hatch: log it after the fact, marked as graded after the outcome.
  */
  const [lockedId, setLockedId] = useState<string | null>(null);
  const [skipLock, setSkipLock] = useState(false);
  const [uploadedSlots, setUploadedSlots] = useState<string[]>([]);
  const [wouldBeR, setWouldBeR] = useState(trade?.would_be_r?.toString() ?? '');
  const [wouldHaveHitTp, setWouldHaveHitTp] = useState<boolean | null>(trade?.would_have_hit_tp ?? null);
  const [rLeftOnTable, setRLeftOnTable] = useState(trade?.r_left_on_table?.toString() ?? '');
  const [skipReason, setSkipReason] = useState<SkipReason | null>(trade?.skip_reason ?? null);

  // Arrived through an animated navigation: the transition plays the card's
  // entrance (lib/nav.ts), so its own rise-in would play it twice.
  const [openedByTransition] = useState(() => typeof document !== 'undefined' && Boolean(document.documentElement.dataset.nav));
  const [date, setDate] = useState(() => (trade ? toLocalInput(new Date(trade.date)) : toLocalInput(new Date())));
  /*
    A backtest never asks for the replayed chart's date: it starts on today,
    like every trade, so it lands on the Backtest calendar on the day it was
    done — nothing to look up from months back. "No date" leaves it off the
    calendar entirely. Ignored on every other account, which always has one.
  */
  const [undated, setUndated] = useState(trade ? trade.undated : false);
  const backtest = isBacktest(account);
  const noDate = backtest && undated;
  const lessonsHere = backtest ? backtestLessons : pastLessons;
  /*
    Choosing the account also moves the reason between worlds. Backtest has its
    own answer to "why did you take it", which gathers replayed trades into a
    group of their own on the whiteboard — offered there and nowhere else, so
    leaving Backtest clears it rather than carrying it onto a real trade.
  */
  const moveAccount = (next: Account) => {
    setAccount(next);
    if (isBacktest(next) && reason == null) setReason(BACKTEST_REASON);
    if (!isBacktest(next) && reason === BACKTEST_REASON) setReason(null);
  };

  /*
    Promises on the Path (app/path). Filing a trade under an account a held
    commitment guards — Eval while the demo eval is not passed — opens the
    commitment sheet: go back, or go ahead with a reason that is saved with
    the trade. Checked on the choice and again on save, which covers an
    account restored from the last trade or a draft. An edit that keeps the
    trade's own account is not asked again.
  */
  const path = usePathSummary();
  const [overrides, setOverrides] = useState<TradeOverride[]>(trade?.overrides ?? []);
  type SaveMode = 'full' | 'quick' | 'lock';
  // kind 'daily': the day's loss limit, same sheet, same rule — a reason, recorded.
  const [sheet, setSheet] = useState<{ kind: 'commitment' | 'daily'; items: HeldCommitment[]; prev: Account | null; thenSubmit: false | SaveMode } | null>(null);
  // Set when the sheet's reason is in; the save re-runs once the render that
  // carries the reason has happened, so it sends it.
  const [resubmit, setResubmit] = useState<false | SaveMode>(false);
  const brokenFor = (acc: Account): HeldCommitment[] => {
    if (editing && trade && acc === trade.account) return [];
    return (path?.held ?? []).filter((h) => h.commitment.guard.accounts?.includes(acc)
      && !overrides.some((o) => o.kind === 'commitment_break' && o.commitment_id === h.commitment.id));
  };
  const changeAccount = (next: Account) => {
    const prev = account;
    moveAccount(next);
    const items = brokenFor(next);
    if (items.length) setSheet({ kind: 'commitment', items, prev, thenSubmit: false });
  };
  // What travels with the save: everything the trade already carried, and the
  // reasons given for promises the account chosen actually breaks.
  const overridesToSend = overrides.filter((o) => (trade?.overrides ?? []).includes(o)
    || (o.kind === 'daily_limit')
    || (path?.held ?? []).some((h) => h.commitment.id === o.commitment_id && h.commitment.guard.accounts?.includes(account)));
  const reasonOptions = backtest || reason === BACKTEST_REASON ? REASONS : REASONS.filter((r) => r !== BACKTEST_REASON);
  const [instrument, setInstrument] = useState<Instrument>(trade?.instrument ?? 'NQ');
  const [direction, setDirection] = useState<Direction>(trade?.direction ?? 'Long');
  const [session, setSession] = useState<Session>(trade?.session ?? 'NY AM');
  const [setupType, setSetupType] = useState<SetupType>(trade?.setup_type ?? 'iFVG');
  const [htfBias, setHtfBias] = useState<HtfBias>(trade?.htf_bias ?? 'With bias');
  const [premiumDiscount, setPremiumDiscount] = useState<PremiumDiscount>(trade?.premium_discount ?? 'Discount');
  const [targetType, setTargetType] = useState<TargetType>(trade?.target_type ?? 'EQH/EQL');
  const [outcome, setOutcome] = useState<Outcome>(trade?.outcome ?? 'Win');
  const [contracts, setContracts] = useState(trade?.contracts?.toString() ?? '');
  const [stopPoints, setStopPoints] = useState(trade?.stop_points?.toString() ?? '');
  const [rMultiple, setRMultiple] = useState(trade?.r_multiple?.toString() ?? '');
  const [lesson, setLesson] = useState(trade?.lesson ?? '');

  /*
    The entry time is still checked against the macro windows, but the answer
    is offered rather than asserted.
    This pill used to arrive pre-ticked whenever the clock happened to be
    inside a window, which put an unasked-for claim on the record — the same
    class of bug as followed_rules defaulting to yes. Nothing on this form
    starts affirmative now; the derived window is shown as a sentence you can
    act on instead.
  */
  const derivedWindow = useMemo(() => (noDate ? null : macroWindowFor(date)), [date, noDate]);
  /*
    Read-only now. Macro time is a fact about the entry time, so it is shown
    as one, derived from the date field — not a pill that could be ticked
    into saying something the clock did not. Change the time to change it.
  */
  const macroTime = derivedWindow !== null;

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
    Everything the draft round-trips. The screenshot is deliberately absent:
    an image cannot go in localStorage without bloating it, and re-pasting a
    chart is a second, not a paragraph.
  */
  const draftValues = useMemo(() => ({
    date, undated, instrument, direction, session, reason, setupType, htfBias,
    premiumDiscount, targetType, outcome, explanation, lesson,
    context, checks, sweepTier, sweepLevel, futuresConfirmed, htfDelivery, followedRules, mistakeTags, workedTags, marketTags, account, accountLabel, status,
    contracts, pnlDollars, stopPoints, rMultiple,
    reached1R, confidence, wouldBeR, confirmed,
    targetHit, targetFresh, oppositeTaken, mgmtPlan, partialAt, mfeR,
  }), [
    undated,
    date, instrument, direction, session, reason, setupType, htfBias,
    premiumDiscount, targetType, outcome, explanation, lesson,
    context, checks, sweepTier, sweepLevel, futuresConfirmed, htfDelivery, followedRules, mistakeTags, workedTags, marketTags, account, accountLabel, status,
    contracts, pnlDollars, stopPoints, rMultiple,
    reached1R, confidence, wouldBeR, confirmed,
    targetHit, targetFresh, oppositeTaken, mgmtPlan, partialAt, mfeR,
  ]);

  const [restored, setRestored] = useState(false);

  // The key handler is bound once; the ref keeps it pointed at the current
  // submit rather than a stale closure over the first render's state.
  const submitRef = useRef<(() => void) | null>(null);

  // Only for a new trade: an edit already has the saved values, and restoring
  // a stale draft over them would quietly rewrite a real record.
  useEffect(() => {
    if (editing) return;
    // A new trade starts on the account you logged the last one to — the
    // same account nine times out of ten, and a wrong default is how a live
    // trade ends up in the demo totals.
    try {
      const last = window.localStorage.getItem(LAST_ACCOUNT_KEY);
      if (last && (ACCOUNT_VALUES as readonly string[]).includes(last)) {
        setAccount(last as Account);
        // Back to backtesting: the backtest reason comes with it, as it does
        // when Backtest is picked by hand. A draft below can still replace it.
        if (last === BACKTEST) setReason(BACKTEST_REASON);
      }
    } catch { /* storage unavailable: keep the default */ }
    const draft = readDraft();
    if (!draft) return;
    const v = draft.values as Record<string, never>;
    const has = (k: string) => v[k] !== undefined && v[k] !== null;
    if (has('reason')) setReason(v.reason);
    if (has('explanation')) setExplanation(v.explanation);
    if (has('lesson')) setLesson(v.lesson);
    if (has('context')) setContext(v.context);
    if (has('checks')) setChecks(v.checks);
    if (has('sweepTier')) setSweepTier(v.sweepTier);
    if (has('sweepLevel')) setSweepLevel(v.sweepLevel);
    if (has('futuresConfirmed')) setFuturesConfirmed(v.futuresConfirmed);
    if (has('htfDelivery')) setHtfDelivery(v.htfDelivery);
    if (has('date')) setDate(v.date);
    if (has('undated')) setUndated(v.undated);
    if (has('instrument')) setInstrument(v.instrument);
    if (has('direction')) setDirection(v.direction);
    if (has('session')) setSession(v.session);
    if (has('setupType')) setSetupType(v.setupType);
    if (has('htfBias')) setHtfBias(v.htfBias);
    if (has('premiumDiscount')) setPremiumDiscount(v.premiumDiscount);
    if (has('targetType')) setTargetType(v.targetType);
    if (has('outcome')) setOutcome(v.outcome);
    if (has('followedRules')) setFollowedRules(v.followedRules);
    if (has('mistakeTags')) setMistakeTags(v.mistakeTags);
    if (has('workedTags')) setWorkedTags(v.workedTags);
    if (has('marketTags')) setMarketTags(v.marketTags);
    if (has('confirmed')) setConfirmed(v.confirmed);
    if (has('account')) setAccount(v.account);
    if (has('accountLabel')) setAccountLabel(v.accountLabel);
    if (has('status')) setStatus(v.status);
    if (has('contracts')) setContracts(v.contracts);
    if (has('pnlDollars')) setPnlDollars(v.pnlDollars);
    if (has('stopPoints')) setStopPoints(v.stopPoints);
    if (has('rMultiple')) setRMultiple(v.rMultiple);
    if (has('reached1R')) setReached1R(v.reached1R);
    if (has('targetHit')) setTargetHit(v.targetHit);
    if (has('targetFresh')) setTargetFresh(v.targetFresh);
    if (has('oppositeTaken')) setOppositeTaken(v.oppositeTaken);
    if (has('mgmtPlan')) setMgmtPlan(v.mgmtPlan);
    if (has('partialAt')) setPartialAt(v.partialAt);
    if (has('mfeR')) setMfeR(v.mfeR);
    if (has('confidence')) setConfidence(v.confidence);
    if (has('wouldBeR')) setWouldBeR(v.wouldBeR);
    // Only claim to have restored something if something was actually written.
    const raw = draft.values as Record<string, unknown>;
    const real = ['explanation', 'lesson', 'reason']
      .some((k) => typeof raw[k] === 'string' && (raw[k] as string).trim().length > 0);
    const tags = raw.mistakeTags;
    setRestored(real || (Array.isArray(tags) && tags.length > 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced, so typing an explanation is not one write per keystroke.
  useEffect(() => {
    if (editing) return;
    const id = window.setTimeout(() => writeDraft(draftValues), 800);
    return () => window.clearTimeout(id);
  }, [draftValues, editing]);

  // Escape leaves the form the same way it closes the detail panel. Nothing is
  // saved on the way out — but the draft survives, so nothing is lost either.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
      // A dialog open over the form owns Escape; leaving would discard the entry.
      if (e.key === 'Escape' && !typing && !dialogIsOpen()) navigate('/');
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S' || e.key === 'Enter')) {
        e.preventDefault();
        submitRef.current?.();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  /*
    The grade these answers get under the current rubric, gates and all. On a
    trade that has left Planned it is only the LIVE grade: the grade at entry
    is locked (see db/trades.ts) and is what the badge shows.
  */
  const live = gradeUnder(CURRENT_RUBRIC, { ...checks, sweep_tier: sweepTier, target_type: targetType });
  const locked = editing && trade!.status !== 'Planned';
  const entryLetter = locked ? trade!.grade_letter : live.letter;
  const modelGate = live.caps.some((c) => c.id === 'model') && (!locked || trade!.rubric_version >= GATES_SINCE);
  const diagonalCap = !modelGate && live.caps.some((c) => c.id === 'diagonal') && (!locked || trade!.rubric_version >= GATES_SINCE);
  // Reviews can only be harsher: the picker offers the entry letter and below.
  const regradeChoices = useMemo(() => {
    const allowed = regradeOptions(entryLetter);
    // A re-grade from before this rule stays on the record, and in the picker.
    const kept = trade?.regrade && !allowed.includes(trade.regrade) ? [trade.regrade] : [];
    return [...kept, ...allowed];
  }, [entryLetter, trade?.regrade]);
  // An answer changed and the entry grade fell below the re-grade already picked.
  useEffect(() => {
    if (regrade && !regradeChoices.includes(regrade)) setRegrade(null);
  }, [regrade, regradeChoices]);
  const planned = status === 'Planned' && !pending('status');
  // A new backtest before its grade is locked: the outcome is not open yet.
  const gradeOpen = backtest && !editing && !lockedId && !skipLock;
  const saved = editing || lockedId != null;
  const stopSet = stopPoints.trim() !== '' || tc.stopPrice.trim() !== '';
  const marketDayNow = backtest ? (chartDate || null) : (noDate ? null : date.slice(0, 10));
  const guard = useGuardContext(account, marketDayNow, trade?.id ?? lockedId);
  const takenNow = !planned && !pending('outcome') && outcome !== 'Not taken';
  const accent = reason ? reasonAccent(reason) : 'var(--accent)';
  /*
    The minimums apply to what you write, not to what a trade already says.
    An entry logged under the old, shorter floor stays editable at its
    original length; touch the text and the current floor applies from there.
    The same rule the API enforces, so the button never promises a save the
    server will refuse — or refuses one it would have accepted.
  */
  const keptExplanation = editing && explanation.trim() === trade!.explanation.trim();
  const keptLesson = editing && lesson.trim() === (trade!.lesson ?? '').trim();
  const explanationOk = explanation.trim().length >= MIN_EXPLANATION
    || (keptExplanation && explanation.trim().length > 0);
  // A Planned trade has no result to learn from, so it is not asked for one.
  const lessonOk = planned || lesson.trim().length >= MIN_LESSON || keptLesson;
  // Planned trades hide the outcome, so it is not waiting on an answer.
  const unconfirmed = DEFAULTED.filter((f) => pending(f) && !(f === 'outcome' && planned));
  // What still has to be chosen. Before a backtest's grade is locked, the
  // stage and the outcome are not asked yet.
  const missing = REQUIRED.filter((f) => pending(f)
    && !(f === 'outcome' && (planned || gradeOpen)) && !(f === 'status' && gradeOpen));
  const extrasMissing = [
    ...(stopSet && beTrigger == null ? ['Breakeven trigger'] : []),
    ...(backtest && !chartDate && !editing ? ['Chart date'] : []),
  ];
  const choicesDone = missing.length === 0 && extrasMissing.length === 0;
  const canSubmit = (Boolean(chart) || saved)
    && Boolean(reason) && explanationOk && lessonOk && choicesDone && !submitting && !gradeOpen;
  // Step A of a backtest: everything but the result, with a chart of the setup.
  const setupChart = Boolean(chart) && firstSlot !== 'Result';
  const canLock = gradeOpen && setupChart && Boolean(reason) && explanationOk && choicesDone && confidence != null && !submitting;

  const num = (v: string) => (v.trim() === '' ? null : Number(v));

  /**
   * Save. `quick` is "Log it fast": whatever is written, past the minimums and
   * with or without a chart, marked quick_log so stats can leave it out. It
   * still needs a reason — one click, and the one thing the journal is for.
   */
  async function submit(mode: SaveMode | boolean = 'full') {
    const m: SaveMode = mode === true ? 'quick' : mode === false ? 'full' : mode;
    const quick = m === 'quick';
    const lock = m === 'lock';
    if (lock ? !canLock : quick ? (!reason || submitting || !choicesDone) : (!canSubmit || !reason)) return;
    const unexplained = brokenFor(account);
    if (unexplained.length) { setSheet({ kind: 'commitment', items: unexplained, prev: null, thenSubmit: m }); return; }
    // The day's loss limit, on a trade being taken now.
    const day = guard?.limit.day;
    if (!lock && takenNow && guard?.limit.reached && day
      && !overrides.some((o) => o.kind === 'daily_limit' && o.commitment_id === `day:${day}`)
      && !(trade?.overrides ?? []).some((o) => o.kind === 'daily_limit')) {
      setSheet({ kind: 'daily', items: [], prev: null, thenSubmit: m });
      return;
    }
    setSubmitting(true);
    setError(null);
    // Step A saves as Planned: the grade is locked before any outcome exists.
    const stage: TradeStatus = lock ? 'Planned' : status;
    const isPlanned = lock || planned;

    const body = new FormData();
    // On an edit, sending no file means "keep the screenshot you already have".
    if (chart && !lockedId) body.append('screenshot', chart);
    // A new trade's first filled slot is its chart; every image keeps its label.
    // Locking a backtest sends everything but the result; the result follows.
    const sent: string[] = [];
    if (!saved && firstSlot) {
      body.append('screenshot_slot', firstSlot);
      sent.push(firstSlot);
      for (const s of SHOT_SLOTS) {
        if (s === firstSlot || !slots[s] || (lock && s === 'Result')) continue;
        body.append('shots', slots[s]!);
        body.append('shot_slots', s);
        sent.push(s);
      }
    }
    body.append('trade', JSON.stringify({
      // Undated: the timestamp is only when it was logged — kept from the
      // first save on an edit, so a backtest keeps its place in the order.
      date: noDate ? (editing && trade ? trade.date : new Date().toISOString()) : date,
      undated: noDate,
      instrument, direction, session,
      macro_time: macroTime, macro_time_auto: true,
      reason, setup_type: setupType, htf_bias: htfBias,
      ...context,
      premium_discount: premiumDiscount, target_type: targetType,
      ...checks,
      sweep_tier: sweepTier,
      // Rubric 4 (trial). A level typed for a sweep that was then changed to
      // NONE is dropped rather than kept as a level nothing was swept at.
      sweep_level: sweepTier === 'major' || sweepTier === 'minor' ? sweepLevel.trim() || null : null,
      sweep_futures_confirmed: sweepTier === 'major' || sweepTier === 'minor' ? futuresConfirmed : null,
      htf_delivery: htfDelivery.trim() || null,
      // Rubric 1's box. The server derives it from the tier when there is one;
      // an old trade that never answered the tier keeps what it had.
      chk_sweep: trade?.chk_sweep ?? null,
      followed_rules: followedRules,
      regrade,
      // The legacy single tag is carried through untouched so an edit never
      // erases a value written under the old taxonomy.
      mistake_tag: trade?.mistake_tag ?? null,
      mistake_tags: mistakeTags,
      market_tags: marketTags,
      worked_tags: workedTags,
      account, account_label: accountLabel.trim() || null,
      overrides: overridesToSend,
      status: stage,
      // The server's to set: it is the frozen score, locked once the trade
      // leaves Planned. Sent only so an older server still gets a value.
      grade_at_entry: trade?.grade_at_entry ?? live.score,
      // True unless this record was opened as a Plan and settled later.
      graded_post_hoc: trade ? trade.graded_post_hoc : status !== 'Planned',
      entry_price: num(tc.entryPrice),
      take_profit: num(tc.targetPrice),
      stop_loss: num(tc.stopPrice),
      // Guardrails (026). The server recomputes R to nearest and the verdict.
      chart_date: backtest ? chartDate || null : trade?.chart_date ?? null,
      nearest_liquidity_type: tc.nearestType,
      nearest_liquidity_price: num(tc.nearestPrice),
      opposing_swings_between: tc.swings,
      eqhl_checks: targetType === 'EQH/EQL' && !pending('targetType') ? tc.eqhl : null,
      be_trigger: beTrigger,
      would_have_hit_tp: wouldHaveHitTp,
      r_left_on_table: num(rLeftOnTable),
      skip_reason: skipReason,
      contracts: num(contracts),
      /*
        The number the account actually moved by.

        This was missing from the payload for its entire life: the field was on
        the form, the column was in the schema, the validator accepted it and
        the stats preferred it over risk x R — and every value ever typed into
        it was dropped on the floor between the input and the request. Nothing
        errored, which is why it took a field-by-field round trip to find.
      */
      pnl_dollars: num(pnlDollars),
      /*
        These four are on the screenshot, so the form stopped asking. An edit
        must still carry whatever an older record already holds — dropping them
        here would quietly erase data the form no longer shows.
      */
      risk_dollars: trade?.risk_dollars ?? null,
      risk_percent: trade?.risk_percent ?? null,
      stop_points: num(stopPoints),
      entry_time: trade?.entry_time ?? null,
      exit_time: trade?.exit_time ?? null,
      // Asked for and then removed: the two numbers were a chore to fill in and
      // nothing was read off them. Older records keep whatever they hold.
      mae_r: trade?.mae_r ?? null, mfe_r: num(mfeR),
      mae_points: null, mfe_points: null,
      reached_1r: reached1R,
      target_hit: targetHit,
      target_fresh: targetFresh,
      opposite_taken: oppositeTaken,
      mgmt_plan: mgmtPlan,
      partial_at: mgmtPlan === 'B' ? partialAt : null,
      confidence_at_entry: confidence,
      would_be_r: num(wouldBeR),
      playbook_id: null,
      // A plan has no result. Storing one would be inventing a trade.
      outcome: isPlanned ? 'Not taken' : outcome,
      r_multiple: isPlanned ? null : num(rMultiple),
      explanation: explanation.trim(), lesson: lesson.trim() || null,
      quick_log: quick,
    }));

    try {
      const savedId = trade?.id ?? lockedId;
      const res = await fetch(savedId ? `/api/trades/${savedId}` : '/api/trades', {
        method: savedId ? 'PUT' : 'POST',
        body,
      });
      if (!res.ok) {
        // A 500 returns an HTML page, not JSON — falling straight through to a
        // generic message hid the real cause once already.
        const body = await res.text();
        let detail = body.slice(0, 300);
        try {
          detail = JSON.parse(body).error ?? detail;
        } catch { /* not JSON; show the raw beginning of the response */ }
        throw new Error(`${detail} (HTTP ${res.status})`);
      }
      const result = await res.json().catch(() => null) as { id?: string } | null;
      if (lock && result?.id) {
        // Grade locked. The outcome opens; the form stays.
        setLockedId(result.id);
        setUploadedSlots(sent);
        setStatus('Settled'); confirm('status');
        clearDraft();
        setSubmitting(false);
        return;
      }
      // Charts not yet on a trade saved earlier (a locked backtest's result).
      const tradeId = savedId ?? result?.id;
      if (lockedId && tradeId) {
        for (const s of SHOT_SLOTS) {
          if (!slots[s] || uploadedSlots.includes(s)) continue;
          const fd = new FormData(); fd.append('screenshot', slots[s]!); fd.append('slot', s);
          await fetch(`/api/trades/${tradeId}/shots`, { method: 'POST', body: fd }).catch(() => {});
        }
      }
      // Saved, so the draft has served its purpose. Leaving it behind would
      // resurrect this trade as a ghost on the next New trade.
      clearDraft();
      try { window.localStorage.setItem(LAST_ACCOUNT_KEY, account); } catch { /* fine */ }
      // Back to the board — animated closed, not reloaded (lib/nav.ts).
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the trade.');
      setSubmitting(false);
    }
  }

  // Refs are not written during render; this keeps the key handler pointed at
  // the current submit without re-binding the listener on every keystroke.
  useEffect(() => { submitRef.current = () => { void submit(gradeOpen ? 'lock' : 'full'); }; });
  useEffect(() => {
    if (!resubmit) return;
    setResubmit(false);
    void submit(resubmit);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resubmit]);

  return (
    <motion.div {...riseIn} initial={openedByTransition ? false : riseIn.initial} transition={springSoft}
      // Named while a navigation runs, so opening and closing animate the card
      // itself (lib/nav.ts, globals.css).
      data-sheet
      className="glass mx-auto rounded-[calc(28px*var(--rk))] p-5 sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[20px] font-semibold">{editing ? 'Edit trade' : lockedId ? 'Grade locked — the result' : 'New trade'}</h1>
          <p className="mt-0.5 text-[12.5px]" style={{ color: 'var(--text-dim)' }}>
            {editing
              ? 'Paste a new chart to replace the screenshot, or leave it as it is.'
              : 'Name the motive before the data. That is the whole point.'}
          </p>
          <div className="mt-2 flex"><PathBanner summary={path} compact /></div>
          {!editing && <div className="mt-2 max-w-[34rem]"><LateNotice ctx={guard} backtest={backtest} /></div>}
        </div>
        <CommitmentSheet
          open={sheet != null}
          title={sheet?.kind === 'daily' ? 'The day’s loss limit is reached' : undefined}
          items={sheet?.kind === 'daily' && guard
            ? [{ text: `Stop after ${guard.limit.stopAfter} loss${guard.limit.stopAfter === 1 ? '' : 'es'}.`,
                where: `${guard.limit.day} · ${accountName(account)} already has ${guard.limit.losses} loss${guard.limit.losses === 1 ? '' : 'es'} that day` }]
            : (sheet?.items ?? []).map((h) => ({ text: h.commitment.text, where: `Step ${h.step.position} · ${h.step.title}` }))}
          current={path?.step ? `Step ${path.step.index} of ${path.total} · ${path.step.title}` : null}
          confirmLabel={sheet?.thenSubmit ? 'Save it anyway' : 'Use this account anyway'}
          onCancel={() => { if (sheet?.prev) moveAccount(sheet.prev); setSheet(null); }}
          onConfirm={(why) => {
            const at = new Date().toISOString();
            const added: TradeOverride[] = sheet?.kind === 'daily' && guard?.limit.day
              ? [{ kind: 'daily_limit', step_id: null, step_title: null, commitment_id: `day:${guard.limit.day}`,
                  commitment_text: `Stop after ${guard.limit.stopAfter} loss${guard.limit.stopAfter === 1 ? '' : 'es'} (${guard.limit.day})`, reason: why, at }]
              : (sheet?.items ?? []).map((h) => ({
                  kind: 'commitment_break', step_id: h.step.id, step_title: h.step.title,
                  commitment_id: h.commitment.id, commitment_text: h.commitment.text, reason: why, at,
                }));
            const thenSubmit = sheet?.thenSubmit;
            setOverrides((prev) => [...prev, ...added]);
            setSheet(null);
            if (thenSubmit) setResubmit(thenSubmit);
          }}
        />

        {/* The board is still behind this card; there was no way back to it
            without saving or using the browser's own history. */}
        <motion.button
          type="button"
          aria-label="Close without saving"
          title="Close without saving (Esc)"
          onClick={() => navigate('/')}
          whileTap={press}
          whileHover={{ scale: 1.06 }}
          transition={spring}
          className="grid size-8 shrink-0 place-items-center rounded-full"
          style={{
            background: 'var(--glass-fill)',
            border: '1px solid var(--glass-stroke)',
            color: 'var(--text-dim)',
          }}
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M1.5 1.5l9 9M10.5 1.5l-9 9" stroke="currentColor"
              strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </motion.button>
      </div>

      {restored && (
        <motion.div
          initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={spring}
          className="mb-6 flex flex-wrap items-center gap-3 rounded-[calc(14px*var(--rk))] px-4 py-2.5 text-[12px]"
          style={{
            background: 'rgb(var(--accent) / 0.10)',
            border: '1px solid rgb(var(--accent) / 0.3)',
            color: 'rgb(var(--accent))',
          }}
        >
          <span>
            Picked up where you left off. These are your unsaved answers, not defaults — the chart
            needs pasting again.
          </span>
          <button
            type="button"
            onClick={() => { clearDraft(); window.location.reload(); }}
            className="ml-auto underline underline-offset-2"
          >
            Start fresh
          </button>
        </motion.div>
      )}

      {/*
        Columns where there is room for them.

        The form had grown to a single tall strip: logging one trade meant four
        or five screens of scrolling, and the checklist — the part that actually
        scores the trade — was always the furthest away. Setup, the writing and
        the checklist are three separate trains of thought, so they sit side by
        side rather than stacked.

        At 1280px each gets its own column. Between 1024 and 1280 there is only
        room for two, so the writing — the tallest of the three by far — takes
      {/*
        Columns of thought, not one tall strip.

        Logging a trade used to mean four or five screens of scrolling, and the
        checklist — the part that actually scores the trade — was always the
        furthest away. The form sorts itself into four trains of thought: what
        the trade WAS, WHEN and on WHAT it happened, what you have to SAY about
        it, and what it SCORES. The old "Details" heap is gone; every field in
        it now lives beside the thing it describes.

        How many of the four get their own column depends on the window:

          under 1024   one column, read top to bottom
          1024-1279    two, filled across — trade | facts, then writing | score
          1280-1899    three: trade and facts stack down the left, the writing
                       and the score take a full-height column each
          1900+        four, one per train of thought

        The last tier is what a 1440p monitor was always going to want. Three
        columns leave a 2560px screen a third empty and still cost a scroll,
        because the checklist is a single ~1000px block that cannot be split —
        it sets the floor for the whole card no matter how the rest is
        arranged. Give it a column of its own alongside three shorter ones and
        the entire capture lands inside one screen.

        The explicit placement at 1280 is doing real work: left to itself the
        grid would put the writing, the facts and the trade across row one and
        drop the score alone on row two beside two empty cells.
      */}
      <div className="grid items-start gap-x-6 gap-y-5 lg:grid-cols-2 xl:grid-cols-4 2xl:gap-x-7">
        {/* A — the trade. */}
        <div className="space-y-4">
        {/* 1 — how it ended. You already know this before you start typing, and
            burying it behind a disclosure made it the last thing recorded. */}
        {/*
          Account first, because it is the one field that must never be wrong:
          backtest R and live R summing into one number would make every other
          figure in the app a lie.
        */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field quiet
            label="Account"
            hint={isHypothetical(account)
              // Missed is not Passed: Passed is a setup you chose not to take,
              // which is often the right call. Missed is one you wanted and
              // did not take — and its outcome is the price of that.
              ? 'Missed: a setup you hesitated on or missed. Log it as if you had taken it — the outcome and R it would have had. It never joins a real total.'
              : backtest
                ? 'Backtest: a replayed trade. Kept apart from All, every real total and the calendar — and it needs no date.'
                : 'Backtest R and live R never sum into the same number.'}
          >
            <Select value={account} onChange={changeAccount} options={accountOptions(account)} labelFor={accountName} />
          </Field>
          <Field quiet label="Account label" hint="Optional — which prop firm, which phase.">
            <Input placeholder="—" value={accountLabel} onChange={(e) => setAccountLabel(e.target.value)} />
          </Field>
          {/* A missed trade's most useful fact is why it was missed — the
              hesitation patterns on Stats split by exactly this. */}
          {isHypothetical(account) && outcome !== 'Not taken' && (
            <Field quiet label="Why you didn't take it" hint="Fear, a rule, not at the screen, or it simply went without you." className="sm:col-span-2">
              <Select value={skipReason} onChange={setSkipReason} options={SKIP_REASONS} placeholder="Why really?" />
            </Field>
          )}
        </div>

        {/*
          A new backtest is graded before its outcome exists: the stage and the
          result stay closed until "Lock grade" (in the footer) saves the setup.
        */}
        {gradeOpen ? (
          <div data-grade-open className="rounded-[calc(16px*var(--rk))] border px-4 py-3 text-[12.5px] leading-snug"
            style={{ borderColor: 'rgb(var(--accent) / 0.45)', background: 'rgb(var(--accent) / 0.07)' }}>
            <b>Grade first.</b> Setup, checklist, confidence and your planned entry, stop and target — then
            <b> Lock grade</b>. The outcome, R and the result chart open after that.
            <button type="button" data-skip-lock onClick={() => setSkipLock(true)}
              className="mt-1.5 block text-[11.5px] underline underline-offset-2" style={{ color: 'var(--text-faint)' }}>
              Skip the lock — log it after the fact (counts as graded after the outcome)
            </button>
          </div>
        ) : (<>
        {lockedId && (
          <div data-grade-locked className="rounded-[calc(16px*var(--rk))] border px-4 py-2.5 text-[12.5px]"
            style={{ borderColor: 'rgb(var(--outcome-win) / 0.45)', color: 'rgb(var(--outcome-win))' }}>
            ✓ Grade locked before the outcome. Now the result.
          </div>
        )}
        {/*
          Two-stage logging is available, never required. 'Settled' stays the
          default so a finished trade can still be written in one pass.
        */}
        <div>
          <Field quiet
            label="Stage"
            pending={pending('status')}
            hint={locked
              ? 'This trade has left Planned, so its grade at entry is locked — it cannot go back.'
              : 'Planned hides the outcome until you settle it. The grade stays open while it is Planned and locks the moment it leaves.'}
           group>
            <Segmented value={pending('status') ? null : status} onChange={(v) => { setStatus(v); confirm('status'); }}
              options={locked || lockedId ? TRADE_STATUSES.filter((st) => st !== 'Planned') : TRADE_STATUSES} />
          </Field>
        </div>

        {/* A Planned trade has no outcome yet, so it is not asked for. */}
        <AnimatePresence initial={false}>
          {planned ? (
            <Collapse key="planned">
              <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text-faint)' }}>
                Planned — the outcome is hidden until you settle it. The score you give it now is kept
                as the entry grade, so hindsight cannot quietly rewrite it.
              </p>
              <PastLessons setup={setupType} lessons={lessonsHere[setupType] ?? []} inline />
            </Collapse>
          ) : (
            <Collapse key="outcome">
              <Field quiet label="How did it end" pending={pending('outcome')} group>
                <Segmented
                  value={pending('outcome') ? null : outcome}
                  onChange={(o) => { setOutcome(o); confirm('outcome'); }}
                  options={OUTCOMES}
                  accentFor={(o) => OUTCOME_COLOR[o]}
                  labelFor={(o) => (o === 'Not taken' ? 'Passed' : o)}
                />
              </Field>
            </Collapse>
          )}
        </AnimatePresence>
        </>)}

        {/* 2 — the chart. */}
        <div>
        {editing ? (
          <ScreenshotDropzone
            file={file}
            onFile={setFile}
            existingUrl={trade!.screenshot_path ? `/api/screenshots/${trade!.screenshot_path}` : null}
          />
        ) : (
          <ShotSlots files={slots} onChange={setSlots} />
        )}
        </div>

        {/* The passed-setup questions belong here, the moment "Not taken"
            is chosen — not four sections further down. */}
        {/* Only meaningful for a setup you passed on — the plan calls this
            the most important thing in the whole file. */}
        <AnimatePresence>
          {outcome === 'Not taken' && (
            <Collapse key="not-taken">
              <div className="space-y-5 pt-1">
                <Field quiet label="Would it have hit TP?" hint="Go back and check. Guessing defeats the point." group>
                  <Segmented
                    value={wouldHaveHitTp === null ? 'Unknown' : wouldHaveHitTp ? 'Yes' : 'No'}
                    onChange={(v) => setWouldHaveHitTp(v === 'Unknown' ? null : v === 'Yes')}
                    options={['Yes', 'No', 'Unknown'] as const}
                    accentFor={(v) => (v === 'Yes' ? 'var(--outcome-win)' : v === 'No' ? 'var(--outcome-loss)' : 'var(--outcome-neutral)')}
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field quiet label="What it would have paid (R)" hint="Go and check. A guess here is worse than a blank.">
                    <Input type="number" step="0.1" inputMode="decimal" placeholder="—"
                      value={wouldBeR} onChange={(e) => setWouldBeR(e.target.value)} />
                  </Field>
                  <Field quiet label="R left on the table">
                    <Input type="number" step="0.1" inputMode="decimal" placeholder="—"
                      value={rLeftOnTable} onChange={(e) => setRLeftOnTable(e.target.value)} />
                  </Field>
                  <Field quiet label="Real reason" hint="Not the story — the reason.">
                    <Select value={skipReason} onChange={setSkipReason} options={SKIP_REASONS} placeholder="Why really?" />
                  </Field>
                </div>
              </div>
            </Collapse>
          )}
        </AnimatePresence>


        {/* 2 — reason, before anything else. */}
        <Field quiet label="Why did you take it" hint="Answer honestly. Nothing else in this app works if this is wrong.">
          <Select
            value={reason}
            onChange={setReason}
            options={reasonOptions}
            placeholder="Name your motive…"
            accentFor={(r) => reasonAccent(r as Reason)}
          />
        </Field>

        {/*
          (Here, under the outcome and the motive, because this column had the
          room: added to the facts column it pushed the form off a 1080p screen.)
          Management: the plan, where the partial came off, how far it ran.
          (The three target questions that sat here — hit, untouched, other
          side taken — were removed: they added nothing. Answers already on
          old trades are kept.)
        */}
        <div data-section="target-management" className="space-y-2.5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field quiet label="Management plan"
              hint={`${mgmtPlan ? MGMT_PLAN_WHY[mgmtPlan] + '\n\n' : ''}Fixed for the whole sample, or the sample measures nothing.`}>
              <Select value={mgmtPlan} onChange={setMgmtPlan} options={MGMT_PLANS}
                labelFor={(o) => MGMT_PLAN_LABEL[o]} titleFor={(o) => MGMT_PLAN_WHY[o]} placeholder="Which plan?" />
            </Field>
            {!gradeOpen && (
              <Field quiet label="Max R reached" hint="How far it went your way before it turned. Check the chart.">
                <Input type="number" step="0.1" min="0" inputMode="decimal" placeholder="—"
                  value={mfeR} onChange={(e) => setMfeR(e.target.value)} />
              </Field>
            )}
            {movedStopSuggested(pending('outcome') ? null : outcome, beTrigger, num(mfeR)) && !mistakeTags.includes('Moved stop') && (
              <div className="sm:col-span-2">
                <Notice id="moved-stop">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>Breakeven before your {beTrigger} trigger was reached ({num(mfeR)}R) — that is a moved stop.</span>
                    <button type="button" data-add-moved-stop onClick={() => setMistakeTags((t) => [...t, 'Moved stop'])}
                      className="rounded-full border px-3 py-1 text-[11.5px] font-medium" style={{ borderColor: 'rgb(var(--accent) / 0.55)', color: 'rgb(var(--accent))' }}>
                      Tag Moved stop
                    </button>
                  </div>
                </Notice>
              </div>
            )}
            {mgmtPlan === 'B' && (
              <Field quiet label="Partial taken at" hint="The kind of level the first half came off at.">
                <Select value={partialAt} onChange={setPartialAt} options={PARTIAL_LEVELS} placeholder="Which level?" />
              </Field>
            )}
          </div>
        </div>
        </div>

        {/* B — when it happened, and on what. Facts about the trade, so they
            sit with the trade rather than in a heap at the bottom. */}
        <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field quiet label="Date & time"
            hint={backtest ? 'Today by default — the day you did the backtest, which is the day it shows on the Backtest calendar. The replayed chart’s date is not needed. "No date" leaves it off the calendar.' : undefined}>
            {noDate ? (
              <div data-undated className="flex h-[38px] items-center justify-between gap-2 rounded-[calc(12px*var(--rk))] border border-dashed px-3 text-[12.5px]"
                style={{ borderColor: 'var(--glass-stroke)', color: 'var(--text-faint)' }}>
                <span>Undated backtest</span>
                <button type="button" data-add-date onClick={() => setUndated(false)}
                  className="text-[11.5px] font-medium underline-offset-2 hover:underline" style={{ color: 'rgb(var(--accent))' }}>
                  Add a date
                </button>
              </div>
            ) : (
              <div className="relative">
                <Input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
                {backtest && (
                  <button type="button" data-remove-date onClick={() => setUndated(true)}
                    className="absolute -top-[1.35rem] right-0 text-[10.5px] underline-offset-2 hover:underline" style={{ color: 'var(--text-faint)' }}>
                    No date
                  </button>
                )}
              </div>
            )}
          </Field>
          {backtest && (
            <Field quiet label="Chart date" pending={!chartDate && !editing}
              hint="The session being replayed. Logs happen at night, so the log time is not the market day — this is what per-day rules and stats use.">
              <Input type="date" value={chartDate} onChange={(e) => setChartDate(e.target.value)} data-chart-date />
            </Field>
          )}
          <Field quiet label="Session" pending={pending('session')}>
            <Select value={pending('session') ? null : session} placeholder="Choose…" onChange={(v) => { setSession(v); confirm('session'); }} options={SESSIONS} />
          </Field>
        </div>

        {!noDate && <div data-macro={derivedWindow ? 'inside' : 'outside'} className="flex items-center gap-2 text-[11.5px]"
          title="Derived from the date and time above — change the time to change this">
          <span className="rounded-full border px-2.5 py-1 font-medium"
            style={{
              borderColor: derivedWindow ? 'rgb(var(--accent) / 0.45)' : 'var(--glass-stroke)',
              color: derivedWindow ? 'rgb(var(--accent))' : 'var(--text-faint)',
            }}>
            {derivedWindow ? `Inside the ${derivedWindow} macro` : 'Outside the macro windows'}
          </span>
          <span style={{ color: 'var(--text-faint)' }}>from the entry time</span>
        </div>}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field quiet label="Instrument" pending={pending('instrument')}><Select value={instrument} onChange={(v) => { setInstrument(v); confirm('instrument'); }} options={INSTRUMENTS} /></Field>
          <Field quiet label="Direction" pending={pending('direction')}><Select value={pending('direction') ? null : direction} placeholder="Choose…" onChange={(v) => { setDirection(v); confirm('direction'); }} options={DIRECTIONS} /></Field>
          <Field quiet label="Setup type" pending={pending('setupType')}><Select value={pending('setupType') ? null : setupType} placeholder="Choose…" onChange={(v) => { setSetupType(v); confirm('setupType'); }} options={SETUP_TYPES} /></Field>
          <Field quiet label="HTF bias" pending={pending('htfBias')}><Select value={pending('htfBias') ? null : htfBias} placeholder="Choose…" onChange={(v) => { setHtfBias(v); confirm('htfBias'); }} options={HTF_BIASES} /></Field>
          <Field quiet label="Premium / discount" pending={pending('premiumDiscount')}><Select value={pending('premiumDiscount') ? null : premiumDiscount} placeholder="Choose…" onChange={(v) => { setPremiumDiscount(v); confirm('premiumDiscount'); }} options={PREMIUM_DISCOUNTS} /></Field>
        </div>
        {!planned && !pending('setupType') && (
          <PastLessons setup={setupType} lessons={lessonsHere[setupType] ?? []} inline={false} />
        )}

        <TargetCheckBlock
          s={{ ...tc, targetType: pending('targetType') ? null : targetType, stopPoints }}
          set={setTcPart} ctx={guard} />

        {/* What it paid. Numbers are facts about the trade, so they sit with
            the rest of the record rather than with the writing — and it keeps
            the writing column under the height the checklist sets. */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {!gradeOpen && <>
          <Field quiet label="R" hint="R multiple — e.g. 2.4, or 1 for a one-R loss (saved negative). Leave blank to settle later.">
            <Input type="number" step="0.1" inputMode="decimal" placeholder="—"
              value={rMultiple} onChange={(e) => setRMultiple(e.target.value)} />
          </Field>
          <Field quiet label="Contracts">
            <Input type="number" step="1" min="0" placeholder="—" value={contracts} onChange={(e) => setContracts(e.target.value)} />
          </Field>
          <Field quiet label="P&L $" hint="What the account made or lost. A loss can be typed as a plain number — it is saved negative.">
            <Input type="number" step="0.01" inputMode="decimal" placeholder="—"
              value={pnlDollars} onChange={(e) => setPnlDollars(e.target.value)} />
          </Field>
          </>}
          <Field quiet label="Stop pts" hint="Stop in points. Optional — it is on the screenshot.">
            <Input type="number" step="0.25" min="0" placeholder="—" value={stopPoints} onChange={(e) => setStopPoints(e.target.value)} />
          </Field>
        </div>
        {/* A loss typed positive is saved negative (domain.ts signForOutcome);
            say so, so the number on the board is never a surprise. */}
        <AnimatePresence initial={false}>
          {outcome === 'Loss' && ((Number(pnlDollars) > 0) || (Number(rMultiple) > 0)) && (
            <motion.p key="loss-sign" data-loss-sign
              initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: exitQuick }} transition={spring}
              className="-mt-2 text-[11px]" style={{ color: 'var(--text-faint)' }}>
              A loss — saved as {[
                Number(rMultiple) > 0 ? `−${Number(rMultiple)}R` : null,
                Number(pnlDollars) > 0 ? `−$${Number(pnlDollars).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null,
              ].filter(Boolean).join(' and ')}.
            </motion.p>
          )}
        </AnimatePresence>

        {/*
          Excursion. How far it went against me before it worked, and how
          far in my favour before it turned — the fastest way to learn
          whether the stop is too tight or the target too greedy, which no
          win rate will ever tell me.
        */}
        <BeTriggerField value={beTrigger} onChange={setBeTrigger} required={stopSet} />

        {!gradeOpen && <TriState inline
          value={reached1R}
          onChange={setReached1R}
          label="Reached +1R before the stop?"
          hint="If most of your losers did, the problem is management rather than selection."
        />}

        {/*
          Recorded here, near the facts, because it only measures anything
          if it is set before the outcome is known. Answered afterwards it is
          just the result wearing a different hat.
        */}
        <div>
          <Field quiet label="Confidence at entry" hint="Optional. Only worth anything if you set it before you knew.">
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <motion.button
                  key={n}
                  type="button"
                  aria-pressed={confidence === n}
                  onClick={() => setConfidence(confidence === n ? null : n)}
                  whileTap={press}
                  transition={spring}
                  animate={{
                    borderColor: confidence === n ? `rgb(${accent} / 0.6)` : 'var(--glass-stroke)',
                    background: confidence === n ? `rgb(${accent} / 0.12)` : 'var(--glass-fill)',
                  }}
                  className="flex-1 rounded-[calc(10px*var(--rk))] border py-1 text-[12px] font-medium"
                  style={{ color: confidence === n ? `rgb(${accent})` : 'var(--text-faint)' }}
                >
                  {'★'.repeat(n)}
                </motion.button>
              ))}
            </div>
          </Field>
          <div className="mt-2">
            <ConfidenceNotice confidence={confidence} ctx={guard} taken={!gradeOpen && !planned && outcome !== 'Not taken'}
              onPass={() => { setOutcome('Not taken'); confirm('outcome'); setStatus('Settled'); confirm('status'); }} />
          </div>
        </div>

        {/*
          What worked, where "The setup" used to be. The post-mortem had only a
          mistakes half, which teaches what to avoid and nothing about what to
          repeat — and a loss traded well looks exactly like a loss traded
          badly until this is filled in.
        */}
        <Field quiet label="What worked" hint="Pick every one that applies — on losers too. A good trade can lose." group>
          <TagPicker small value={workedTags} onChange={setWorkedTags} options={tagOptions(WORKED_TAGS, trade?.worked_tags)} tone="win" />
        </Field>

        {/* The context pills are retired (see CONTEXT_GROUPS); an edit still
            carries whatever an older trade answered, through `context`. */}
        </div>

        {/* C — the writing, and the reckoning that goes with it. */}
        <div className="space-y-4">
        {/* 3 — the writing. */}
        <Field quiet label="Explanation">
          <ExplanationField
            value={explanation}
            onChange={setExplanation}
            minChars={MIN_EXPLANATION}
            kept={keptExplanation}
            minRows={5}
            placeholder="What did you see, what did you expect, and what made you click the button?"
          />
        </Field>

        {/*
          3b — the lesson, beside the explanation and just as demanding.
          What happened and what to do about it are two different thoughts, and
          only the second one changes anything. Not asked of a Planned trade:
          there is no outcome to draw a lesson from yet.
        */}
        {!planned && !gradeOpen && (
          <Field quiet
            label="Lesson"
            hint={`What would you do differently? At least ${MIN_LESSON} characters — a label is not a lesson.`}
          >
            <ExplanationField
              value={lesson}
              onChange={setLesson}
              required
              minChars={MIN_LESSON}
              kept={keptLesson}
              minRows={5}
              placeholder="Next time: the sweep was there but I took it before the candle closed. Wait for the close, even when it looks like it is leaving without me."
            />
          </Field>
        )}


        {/* After the close: the honest part. */}
        <Field label="Honest re-grade" hint={`Graded ${entryLetter} at entry${locked ? ' (locked)' : ''}. ${REGRADE_HINT}`}>
          <div data-regrade-options={regradeChoices.join(' ')}>
            <Select value={regrade} onChange={setRegrade} options={regradeChoices} placeholder="Not re-graded yet" />
          </div>
        </Field>

        {/*
          What went wrong, in two halves: my execution and the market. Stored
          apart (mistake_tags, market_tags) and read apart in Stats; they share
          this one spot behind a two-way switch because a second block made
          the form taller than the screen. The counts on the switch show what
          is tagged on the half you are not looking at.
        */}
        <Field quiet
          label={tagSide === 'me' ? 'What went wrong' : 'What the market did'}
          hint={tagSide === 'me'
            ? 'Your execution: what you did that cost the trade. Notes only — a tag never marks the trade as a rule break; the checklist decides that.'
            : 'Outside your control: the market, not you. Kept apart from your execution so Stats can tell process from luck. Never a rule break.'}
          group
          badge={
            <span data-tag-side className="flex shrink-0 gap-1 text-[10.5px] font-medium normal-case tracking-normal">
              {(['me', 'market'] as const).map((side) => {
                const on = tagSide === side;
                const n = side === 'me' ? mistakeTags.length : marketTags.length;
                return (
                  <button key={side} type="button" data-side={side} aria-pressed={on} data-no-press
                    onClick={() => setTagSide(side)}
                    className="rounded-full border px-2 py-0.5 transition-colors"
                    style={{
                      borderColor: on ? `rgb(var(${side === 'me' ? '--outcome-loss' : '--amber'}) / 0.5)` : 'var(--glass-stroke)',
                      background: on ? `rgb(var(${side === 'me' ? '--outcome-loss' : '--amber'}) / 0.1)` : 'transparent',
                      color: on ? `rgb(var(${side === 'me' ? '--outcome-loss' : '--amber'}))` : 'var(--text-faint)',
                    }}>
                    {side === 'me' ? 'Me' : 'Market'}{n > 0 ? ` · ${n}` : ''}
                  </button>
                );
              })}
            </span>
          }
        >
          {tagSide === 'me'
            ? <TagPicker small value={mistakeTags} onChange={setMistakeTags} options={tagOptions(MISTAKE_TAGS, trade?.mistake_tags)} />
            : (
              <div data-market-tags>
                <TagPicker small value={marketTags} onChange={setMarketTags} options={MARKET_TAGS} tone="market" />
              </div>
            )}
        </Field>

        {/*
          Your own verdict, directly under your own account of what went wrong.

          It sat under the checklist for a while, so the gap between what the
          score says and what you believe about yourself would be impossible to
          miss. On a wide window nothing scrolls any more, so both are on screen
          together wherever they sit — and the checklist block is the one thing
          in this form that cannot be split, so anything else stacked on it sets
          the height of the whole card. This costs nothing and buys the last
          hundred and thirty pixels.
        */}
        {/*
          The one question about my own discipline, so it is lit: it glows
          softly until it is answered, then settles into green (yes) or red
          (no). Still optional, still never a gate.
        */}
        <div data-followed-rules={followedRules == null ? 'unset' : followedRules ? 'yes' : 'no'}
          className={`rounded-[calc(14px*var(--rk))] border px-3 py-2 transition-[background-color,border-color,box-shadow] duration-300 ${followedRules == null ? 'signature-glow' : ''}`}
          style={{
            borderColor: followedRules == null ? 'rgb(var(--accent) / 0.55)'
              : followedRules ? 'rgb(var(--outcome-win) / 0.6)' : 'rgb(var(--outcome-loss) / 0.6)',
            background: followedRules == null ? 'rgb(var(--accent) / 0.08)'
              : followedRules ? 'rgb(var(--outcome-win) / 0.10)' : 'rgb(var(--outcome-loss) / 0.10)',
            boxShadow: followedRules == null ? undefined
              : `0 0 18px rgb(var(${followedRules ? '--outcome-win' : '--outcome-loss'}) / 0.25)`,
          }}>
          <TriState inline
            value={followedRules}
            onChange={setFollowedRules}
            label="Followed ALL rules"
            hint="Max 2 trades, stop after 2 losses, no revenge, size within 1%. Leave it unset rather than guessing — stats read the checklist, not this answer."
          />
        </div>
        </div>

        {/* D — the score. */}
        <div className="space-y-4">
        {/* 5 — the checklist, with the live score. */}
        <div>
          <span className="mb-2 block cursor-help text-[11px] font-medium uppercase tracking-[0.07em]"
            style={{ color: 'var(--text-faint)' }}
            title="Hover any line for what it means. Phase 3 must fire for an entry to exist. The sweep and the single gap are gates: fail either and the grade stops at C, whatever the total. At 70 or more with the trigger fired and both gates passed, taking it is the rule — hesitating is a rule break, same as oversizing.">
            Checklist <span aria-hidden className="normal-case opacity-60">ⓘ</span>
          </span>

          <div className="mb-3 space-y-2">
            {locked ? (
              /*
                The grade the trade was taken on, not the one these answers
                would get now. The live grade is still shown when they differ,
                so a correction is visible without rewriting history.
              */
              <div data-grade-locked={trade!.grade_letter}>
                <GradeBadge total={trade!.checklist_score} max={100} size="md" showPrompt
                  triggerFired={trade!.trigger_fired} letter={trade!.grade_letter} />
                <p className="mt-2 text-[11px] leading-snug" style={{ color: 'var(--text-faint)' }}>
                  Grade at entry, locked when this trade left Planned
                  {trade!.rubric_version < CURRENT_RUBRIC ? ` (rubric ${trade!.rubric_version})` : ''}. Changing the
                  boxes is recorded in its history but cannot change it.
                  {(live.letter !== trade!.grade_letter || live.score !== trade!.checklist_score) && (
                    <span data-live-grade className="block" style={{ color: 'var(--text-dim)' }}>
                      These answers now: {live.letter} · {live.score}%.
                    </span>
                  )}
                </p>
              </div>
            ) : (
              <GradeBadge total={live.earned} max={live.possible} size="md" showPrompt
                triggerFired={live.trigger} letter={live.letter} />
            )}
            {/* The gates outrank the total: said in red, above the boxes that caused it. */}
            <AnimatePresence initial={false}>
              {modelGate && (
                <motion.div key="gate" data-gate-banner role="alert"
                  initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4, transition: exitQuick }}
                  transition={springSoft}
                  className="rounded-[calc(12px*var(--rk))] border px-3 py-2 text-[12.5px] font-semibold leading-snug"
                  style={{
                    color: 'rgb(var(--outcome-loss))', borderColor: 'rgb(var(--outcome-loss) / 0.45)',
                    background: 'rgb(var(--outcome-loss) / 0.10)',
                  }}>
                  {MODEL_GATE_MESSAGE}
                </motion.div>
              )}
              {diagonalCap && (
                <motion.p key="diag" data-diagonal-cap initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: exitQuick }}
                  className="text-[11.5px] font-medium leading-snug" style={{ color: 'rgb(var(--amber))' }}>
                  LRLR (trendline) target — max grade B.
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          <Checklist answers={checks} onChange={setCheck} accent={accent}
            sweepTier={sweepTier} onSweepTier={(t) => { setSweepTier(t); confirm('sweepTier'); }}
            sweepPending={pending('sweepTier')}
            slot={{
              /*
                The target is picked where the rule about it is: on "Targets
                are clear". Picking one names the target, so it ticks the box
                when the box was not ticked — untick it if it was not clear.
              */
              chk_targets_clear: (
                <div data-target-picker className="w-[10.5rem] rounded-[calc(10px*var(--rk))]"
                  title={targetType === WEAK_TARGET ? `${WEAK_TARGET_WARNING} Max grade B.`
                    : (targetType && TARGET_WHY[targetType]) || 'The target you aimed at — ranked strongest first. Hover an option for why.'}
                  data-target-warning={targetType === WEAK_TARGET ? '' : undefined}
                  style={targetType === WEAK_TARGET
                    // LRLR: the weakest target, max grade B — amber, said on hover.
                    ? { boxShadow: '0 0 0 1.5px rgb(var(--amber) / 0.7)' }
                    : pending('targetType') ? { boxShadow: `0 0 0 1.5px rgb(${accent} / 0.6)` } : undefined}>
                  <Select compact value={pending('targetType') ? null : targetType} placeholder="Target…"
                    onChange={(v) => {
                      setTargetType(v); confirm('targetType');
                      if (checks.chk_targets_clear !== true) setCheck('chk_targets_clear', true);
                    }}
                    options={targetTypeOptions(trade?.target_type ?? null)} titleFor={(o) => TARGET_WHY[o]} />
                </div>
              ),
            }} />

          <TrialLiquidity accent={accent}
            answers={{
              ...checks, sweep_tier: sweepTier, target_type: targetType,
              sweep_level: sweepLevel, sweep_futures_confirmed: futuresConfirmed, htf_delivery: htfDelivery,
            }}
            sweepTier={sweepTier}
            sweepLevel={sweepLevel} onSweepLevel={setSweepLevel}
            futuresConfirmed={futuresConfirmed} onFuturesConfirmed={setFuturesConfirmed}
            htfDelivery={htfDelivery} onHtfDelivery={setHtfDelivery} />
        </div>
        </div>
      </div>


      <div className="mt-5 flex items-center justify-between gap-5">
        <div className="min-w-0 text-[12px]" style={{ color: 'var(--text-faint)' }}>
          <AnimatePresence mode="wait">
            <motion.span
              key={!chart && !saved ? 'file' : !reason ? 'reason'
                : !explanationOk ? 'expl' : !choicesDone ? 'choose' : gradeOpen ? 'lock' : !lessonOk ? 'lesson' : 'ready'}
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4, transition: exitQuick }}
              transition={spring} className="block truncate"
            >
              {!chart && !saved ? 'A screenshot is required.'
                : !reason ? 'Name your motive to continue.'
                : !explanationOk ? `${MIN_EXPLANATION - explanation.trim().length} more characters of explanation.`
                : !choicesDone ? `Still to choose: ${[...missing.map((f) => DEFAULTED_LABEL[f]), ...extrasMissing].join(', ')}.`
                : gradeOpen ? (confidence == null ? 'Set your confidence, then lock the grade.' : !setupChart ? 'Add a chart of the setup (not the result) to lock the grade.' : 'Ready to lock the grade.')
                : !lessonOk ? `${MIN_LESSON - lesson.trim().length} more characters of lesson.`
                : unconfirmed.length
                  ? `Ready. Still on the default: ${unconfirmed.map((f) => DEFAULTED_LABEL[f]).join(', ')}.`
                  : 'Ready.'}
            </motion.span>
          </AnimatePresence>
        </div>

        <div className="flex shrink-0 items-center gap-4">
        {/*
          The escape hatch. Shown whenever the full entry is not ready yet, so a
          bad day never ends with no record at all.
        */}
        {!canSubmit && !submitting && !saved && !gradeOpen && (
          <button
            type="button"
            data-quick-log
            onClick={() => void submit(true)}
            disabled={!reason || !choicesDone}
            title={!reason ? 'Name why you took it first — that one field is still needed.'
              : !choicesDone ? 'Choose the stage, the outcome and the rest first — a quick log still gets no defaults.'
              : 'Saves what is written now, without the minimums or a chart. Marked as a quick log; finish it later from the trade.'}
            className="shrink-0 text-[12px] font-medium underline underline-offset-4 disabled:opacity-40"
            style={{ color: 'var(--text-dim)' }}
          >
            Log it fast
          </button>
        )}
        {gradeOpen ? (
          <Button variant="primary" accent={accent} disabled={!canLock} onClick={() => void submit('lock')} className="shrink-0" data-lock-grade>
            {submitting ? 'Locking…' : 'Lock grade'}
          </Button>
        ) : (
          <Button variant="primary" accent={accent} disabled={!canSubmit} onClick={() => void submit()} className="shrink-0" data-save-trade>
            {submitting ? 'Saving…' : editing ? 'Save changes' : 'Save trade'}
          </Button>
        )}
        </div>
      </div>

      <AnimatePresence>
        {error && (
          <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: exitQuick }}
            transition={spring}
            className="mt-4 whitespace-pre-wrap break-words rounded-[calc(14px*var(--rk))] p-3 text-[12px] leading-relaxed"
            style={{ color: 'rgb(var(--outcome-loss))', background: 'rgb(var(--outcome-loss) / 0.10)' }}>
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
