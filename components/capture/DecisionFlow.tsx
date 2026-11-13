'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { usePreferences } from '@/components/shell/PreferencesProvider';
import { Select } from '@/components/ui/Select';
import { Segmented } from '@/components/ui/Segmented';
import { Field, Input } from '@/components/ui/Field';
import { Help } from '@/components/ui/Help';
import { Button } from '@/components/ui/Button';
import { ShotSlots, type SlotFiles } from './ShotSlots';
import { ExplanationField } from './ExplanationField';
import { DrillChip, type DrillKept } from './DrillChip';
import { SimilarCard, type SimilarResult } from './SetupAnatomy';
import { SessionTally } from './SessionTally';
import { PathBanner } from '@/components/path/PathBanner';
import { TRADE_SAVED } from '@/components/review/SavedNotice';
import { CAPTURE_OUTSIDE } from './CaptureSheet';
import { PlanStrip, ReplayBuilder, ReplayDayControl, replayCards, useReplay, type PlanCard } from '@/components/replay/ReplayPlan';
import { scenarioLine as prepLine } from '@/lib/prep';
import { noBiasCap, replayTradeDate } from '@/lib/replay';
import { closeCapture } from '@/lib/nav';
import { clearCarry, readCarry, writeCarry } from '@/lib/backtestSession';
import { press, spring, springSoft, riseIn } from '@/lib/motion';
import {
  BACKTEST, BACKTEST_REASON, INSTRUMENTS, MANAGEMENTS, SESSIONS, SHOT_SLOTS,
  accountLabel, tagOptions, type Account,
} from '@/lib/domain';
import { EXIT_REASONS } from '@/lib/anatomy';
import { REGRADE_HINT, regradeOptions, type GradeLetter } from '@/lib/grade';
import { MIN_EXPLANATION, MIN_LESSON, MIN_PASS_EXPLANATION, type Trade } from '@/lib/types';
import { playChime } from '@/lib/chime';
import {
  PASS_REASONS, decisionReplay, AUTO_MARKET_TAGS, MARKET_TAGS_V2, ME_TAGS, WORKED_TAGS_V2, autoMarketTags, overTime, tagBlocked,
  DECISION_LABEL, HTF_ORIGINS, SINGULAR_GAP_LABEL, SINGULAR_GAP_QUESTION, gapOf, type HtfOrigin, type SingularGap, LEG_HELP, LEG_LOCATIONS, OVERRIDE_PROMPT, ROWS, RUBRIC_V2_LABEL, SCENARIO_LABEL,
  V2_ENTRIES, V2_LETTER_OF, V2_PLANNED_RS, V2_TARGETS, clock, consistencyFlags, gradeV2, lockDecision,
  needsOverride, rulesFollowedV2, scenarioFromPlan, STEP1_EDITABLE, step1Answers, step1EditedAfterOutcome, storedGrade,
  type Step1Answers, type Step1Key, type Decision, type LegLocation, type RowKey, type TimedKey, type Scenario, type V2Grade,
} from '@/lib/decision';

/*
  New trade, rubric v2 (4 rows): Step 1 decides against a clock, Step 2
  writes the outcome. The record is saved at Step 1; Step 2 can follow now
  or later (an outcome-pending trade counts nowhere until it is written).
  Old trades keep the old form (NewTradeForm).
*/

const LAST_ACCOUNT_KEY = 'signature.lastAccount';
const LAST_INSTRUMENT_KEY = 'signature.lastInstrument';
const ACCOUNTS: readonly Account[] = ['Backtest (FX Replay)', 'Demo', 'Live', 'Eval', 'Funded'];
const faint = { color: 'var(--text-faint)' } as const;
const dim = { color: 'var(--text-dim)' } as const;
const read = (k: string) => { try { return window.localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { window.localStorage.setItem(k, v); } catch { /* fine */ } };
const pad = (n: number) => String(n).padStart(2, '0');
const localNow = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
// Built once: a list made inside the component is a new array every tick of the clock.
const TARGET_VALUES = V2_TARGETS.map((t) => t.value);
const targetLabel = (v: string) => V2_TARGETS.find((t) => t.value === v)?.label ?? v;
const ENTRY_VALUES = V2_ENTRIES.map((t) => t.value);
const entryLabel = (v: string) => V2_ENTRIES.find((t) => t.value === v)?.label ?? v;
const CONFIDENCES = ['1', '2', '3', '4', '5'] as const;
/* Answers carry their meaning in colour, as the old form did: 'r g b' triples for Segmented's accentFor. */
const WIN = 'var(--outcome-win)';
const LOSS = 'var(--outcome-loss)';
const NEUTRAL = 'var(--outcome-neutral)';
const CAUTION = 'var(--grade-b)';
const directionTone = (d: string) => (d === 'Long' ? WIN : LOSS);
const scenarioTone = (s: string) => (s === 'A' ? WIN : CAUTION);
/** The leg location against the direction: buying in discount or selling in premium is the good side; the other side caps the grade. */
const legTone = (direction: string | null) => (l: string) =>
  l === 'EQ' || !direction ? NEUTRAL : (direction === 'Long') === (l === 'Discount') ? WIN : LOSS;
const plannedRTone = (r: string) => (r === '1.5' ? CAUTION : WIN);
const confidenceTone = (c: string) => (Number(c) <= 2 ? LOSS : c === '3' ? CAUTION : WIN);
const endedTone = (e: string) => (e === 'Win' || e === 'Partial win' ? WIN : e === 'Loss' ? LOSS : NEUTRAL);
const yesNoTone = (v: string) => (v === 'Yes' ? WIN : LOSS);
const exitTone = (x: string) => (x === 'TP' ? WIN : x === 'SL' ? LOSS : x.startsWith('Manual') ? CAUTION : NEUTRAL);
const LETTER_TONE: Record<string, string> = { 'A+': 'rgb(var(--grade-aplus))', A: 'rgb(var(--grade-a))', B: 'rgb(var(--grade-b))', 'No trade': 'rgb(var(--grade-f))' };

export function DecisionFlow({ trade, onNext }: { trade?: Trade; onNext?: () => void }) {
  const [saved, setSaved] = useState<Trade | null>(trade ?? null);
  // After the decision, Back shows Step 1 as it was locked; Step 2 stays mounted underneath, so nothing typed is lost.
  const [view, setView] = useState<'outcome' | 'locked'>('outcome');
  // "Start fresh": Step 1 mounted anew — clock from zero, every answer cleared; account, instrument and session kept.
  const [fresh, setFresh] = useState<{ n: number; keep: Keep | null }>({ n: 0, keep: null });
  return (
    <motion.div {...riseIn} transition={springSoft} data-sheet data-decision-flow={saved ? view : 'decide'}
      // Fills the window below the title bar: the columns stretch to the bottom instead of stopping short.
      className="glass mx-auto flex flex-col rounded-[calc(28px*var(--rk))] p-5 sm:p-6 lg:min-h-[calc(100dvh-var(--titlebar-h,2.75rem)-2rem)]">
      {saved ? (
        <>
          {view === 'locked' && <LockedStep1 trade={saved} onForward={() => setView('outcome')} onEdited={setSaved} />}
          <div className={view === 'locked' ? 'hidden' : 'flex flex-1 flex-col'}>
            <OutcomeStep trade={saved} onNext={onNext} onBack={() => setView('locked')} />
          </div>
        </>
      ) : <DecideStep key={fresh.n} keep={fresh.keep} onSaved={setSaved} onFresh={(keep) => setFresh((f) => ({ n: f.n + 1, keep }))} />}
    </motion.div>
  );
}

/* ═════════════════════════ Step 1 — Decide ═════════════════════════ */

type Keep = { account: Account; instrument: string; session: string };

function DecideStep({ onSaved, onFresh, keep }: { onSaved: (t: Trade) => void; onFresh: (keep: Keep) => void; keep: Keep | null }) {
  const { prefs } = usePreferences();
  // The clock starts the moment the form opens.
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [carry] = useState(() => (typeof window === 'undefined' ? null : readCarry()));
  useEffect(() => { clearCarry(); }, []);

  const [account, setAccount] = useState<Account>(() => {
    const last = keep?.account ?? carry?.account ?? read(LAST_ACCOUNT_KEY);
    return (ACCOUNTS as readonly string[]).includes(last ?? '') ? last as Account : BACKTEST;
  });
  const backtest = account === BACKTEST;
  const [instrument, setInstrument] = useState(() => {
    const last = keep?.instrument ?? carry?.instrument ?? read(LAST_INSTRUMENT_KEY);
    return (INSTRUMENTS as readonly string[]).includes(last ?? '') ? last! : 'NQ';
  });
  // NY AM unless "Save & next" carried the replay's session over.
  const [session, setSession] = useState<string>(() => keep?.session ?? carry?.session ?? 'NY AM');
  const [direction, setDirection] = useState<'Long' | 'Short' | null>(null);
  const [picked, setPicked] = useState<Scenario | null>(null);
  const [leg, setLeg] = useState<LegLocation | null>(null);
  // The singular-gap gate: no default, tapped every time (true = one gap).
  const [gap, setGapValue] = useState<boolean | null>(null);
  const [htfOrigin, setHtfOrigin] = useState<HtfOrigin | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [entry, setEntry] = useState<string | null>(null);
  const [plannedR, setPlannedR] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [rows, setRows] = useState<Partial<Record<RowKey, 0 | 1 | 2>>>({});
  const [scoredAt, setScoredAt] = useState<Partial<Record<TimedKey, number>>>({});
  // The gate is timed like the rows, for the decision replay.
  const setGap = useCallback((v: boolean | ((x: boolean | null) => boolean)) => {
    setGapValue(v);
    setScoredAt((s) => ({ ...s, singular_gap: Date.now() }));
  }, []);
  const [focus, setFocus] = useState(0);
  const [slots, setSlots] = useState<SlotFiles>({});
  const [asking, setAsking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  // Take or Pass pressed with answers missing: the missing ones blink once.
  const [flashing, setFlashing] = useState(false);
  const done = useRef(false);

  const timed = prefs.timedDecision[account] ?? false;
  const limit = prefs.decisionSeconds;
  // Backtests trade on a replay day: its plan must be locked first, or the trade is taken without one.
  const { state: replay } = useReplay(backtest);
  const day = backtest ? replay?.active ?? null : null;
  const [noPlanChosen, setNoPlan] = useState(false);
  // "Trade without a plan" holds only until a day is locked (from the header, say): then the plan counts.
  const noPlan = noPlanChosen && !day;
  const [planning, setPlanning] = useState(false);
  const [freshAsk, setFreshAsk] = useState(false);
  const gate = backtest && replay != null && !day && !noPlan;
  // The clock waits while the day is planned (or the choice is made), then starts from zero.
  const gated = useRef(false);
  useEffect(() => {
    if (gate) { gated.current = true; return; }
    if (gated.current) { gated.current = false; setStartedAt(Date.now()); }
  }, [gate]);
  const c = clock(startedAt, gate || planning ? startedAt : now, limit);
  const expired = timed && c.expired;

  // A tenth of a second is fine enough for a clock read in whole seconds.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, []);

  // Demo and Live: the morning plan's scenario for this direction, pre-selected. Backtests: always chosen by hand.
  const [plans, setPlans] = useState<{ aDir: string | null; bDir: string | null; aLine: string | null; bLine: string | null } | null>(null);
  useEffect(() => {
    if (backtest) return;
    const d = new Date(); const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    let live = true;
    void fetch(`/api/prep?day=${day}`).then((r) => (r.ok ? r.json() : null)).then((j: { prep: { data: { answers: Record<string, unknown> } } | null } | null) => {
      if (!live) return;
      const a = j?.prep?.data.answers;
      const s = (k: string) => (typeof a?.[k] === 'string' ? a[k] as string : null);
      setPlans(a ? { aDir: s('plans.aDir'), bDir: s('plans.bDir'), aLine: prepLine(a as never, 'a'), bLine: prepLine(a as never, 'b') } : null);
    }).catch(() => {});
    return () => { live = false; };
  }, [backtest]);
  // Chosen by hand wins; otherwise, off backtests, the morning plan's scenario for this direction.
  // No plan for this replay day: the trade is Unplanned (max B), not A or B.
  const scenario: Scenario | null = noPlan && backtest ? 'none' : picked ?? (backtest ? null : scenarioFromPlan(direction, plans));
  const setScenario = (s: Scenario) => setPicked(s);

  const input = { ...rows, no_bias_day: day ? noBiasCap(day.context) : false, singular_gap: gap, direction, plan_scenario: scenario, leg_location: leg, planned_rr: plannedR };
  const grade: V2Grade = gradeV2(input);
  // Planned R is required too: the Target row's thresholds (1.5R, 2R) are read against it.
  // Target type too: with no default, "not picked" and a real "Other" can be told apart (the drill reads it).
  const ready = grade.missing.length === 0 && gap != null && direction != null && scenario != null && plannedR != null && target != null;
  const owed = [
    ...(gap == null ? ['singular gap'] : []),
    ...grade.missing.map((k) => ROWS.find((r) => r.key === k)!.label),
    ...(direction ? [] : ['direction']), ...(scenario ? [] : ['scenario']), ...(plannedR ? [] : ['planned R']), ...(target ? [] : ['target type']),
  ];
  const optional = [leg ? null : 'leg location', htfOrigin ? null : 'HTF origin', entry ? null : 'entry', confidence ? null : 'confidence'].filter(Boolean) as string[];

  // Scoring a row moves the focus to the next row still unscored (in key order, wrapping); when every
  // row is scored it stays put. Re-scoring an earlier row therefore never drags the focus somewhere odd.
  const score = useCallback((key: RowKey, v: 0 | 1 | 2) => {
    setRows((r) => {
      const next = { ...r, [key]: v };
      const at = ROWS.findIndex((x) => x.key === key);
      const open = [...ROWS.slice(at + 1), ...ROWS.slice(0, at)].find((x) => next[x.key] == null);
      setFocus(open ? ROWS.findIndex((x) => x.key === open.key) : at);
      return next;
    });
    setScoredAt((s) => ({ ...s, [key]: Date.now() }));
  }, []);

  const save = useCallback(async (choice: Decision, override = false, thenClose = false) => {
    if (done.current) return;
    done.current = true;
    setSaving(true);
    setError(null);
    const at = Date.now();
    const rec = lockDecision({ choice, startedAt, at, limit: timed ? limit : null, grade, override, scoredAt });
    const reason = backtest ? BACKTEST_REASON : grade.letter === 'A+' || grade.letter === 'A' ? 'Rules-based (A+ setup)' : 'Rules-based (B setup)';
    const payload = {
      // On a replay day the trade carries the replayed date, at the session's usual time.
      date: day ? replayTradeDate(day.replay_date, session) : localNow(), undated: false, replay_day_id: day?.id ?? null, instrument, direction: direction ?? 'Long', session,
      macro_time: false, macro_time_auto: true, reason, setup_type: carry?.setupType ?? 'iFVG',
      htf_bias: scenario === 'A' ? 'With bias' : scenario === 'B' ? 'Against bias' : 'No bias defined',
      premium_discount: leg === 'EQ' || !leg ? 'Equilibrium' : leg,
      target_type: target ?? 'Other',
      ...rows, singular_gap: gap, htf_origin: htfOrigin, plan_scenario: scenario, leg_location: leg, planned_rr: plannedR, entry_method: entry,
      confidence_at_entry: confidence,
      ...rec,
      account, account_label: carry?.accountLabel || null,
      // Taken: open until Step 2 writes how it ended. Passed or missed: priced in Step 2.
      status: rec.decision === 'take' ? 'Live' : 'Settled',
      outcome: 'Not taken', r_multiple: null,
      explanation: '', lesson: null, mistake_tags: [], worked_tags: [], market_tags: [],
    };
    const body = new FormData();
    const first = SHOT_SLOTS.find((s) => slots[s]) ?? null;
    if (first) {
      body.append('screenshot', slots[first]!);
      body.append('screenshot_slot', first);
      for (const s of SHOT_SLOTS) if (s !== first && slots[s]) { body.append('shots', slots[s]!); body.append('shot_slots', s); }
    }
    body.append('trade', JSON.stringify(payload));
    try {
      const res = await fetch('/api/trades', { method: 'POST', body });
      const text = await res.text();
      if (!res.ok) { let msg = text.slice(0, 300); try { msg = JSON.parse(text).error ?? msg; } catch { /* raw */ } throw new Error(msg); }
      write(LAST_ACCOUNT_KEY, account);
      write(LAST_INSTRUMENT_KEY, instrument);
      if (thenClose) { window.dispatchEvent(new CustomEvent(TRADE_SAVED, { detail: (JSON.parse(text) as Trade).id })); closeCapture(); return; }
      onSaved(JSON.parse(text) as Trade);
    } catch (e) {
      done.current = false;
      setSaving(false);
      setError(e instanceof Error ? e.message : 'Could not save the decision.');
    }
  }, [startedAt, timed, limit, grade, scoredAt, backtest, instrument, direction, session, carry, scenario, leg, target, rows, plannedR, entry, confidence, account, slots, onSaved, gap, htfOrigin, day]);

  const owedText = owed.join(', ');
  const decide = useCallback((choice: 'take' | 'pass') => {
    if (saving || done.current) return;
    if (!ready) {
      setError(`Still to answer: ${owedText}.`);
      setFlashing(false); requestAnimationFrame(() => setFlashing(true));
      return;
    }
    if (choice === 'take' && needsOverride(grade)) { setAsking(true); return; }
    void save(choice);
  }, [saving, ready, owedText, grade, save]);

  // The clock runs out: a soft chime, once. It decides nothing — the clock keeps counting, and
  // Take, Pass or Missed stays your call; the time it took is stored either way.
  const chimed = useRef(false);
  useEffect(() => {
    if (!expired || chimed.current || done.current) return;
    chimed.current = true;
    if (prefs.decisionChime) playChime();
  }, [expired, prefs.decisionChime]);

  // Anything entered at all: closing then asks. An untouched form just closes.
  const touched = Object.keys(rows).length > 0 || gap != null || htfOrigin != null || direction != null || picked != null || leg != null || target != null
    || entry != null || plannedR != null || confidence != null || Object.values(slots).some(Boolean);
  const requestClose = useCallback(() => { if (touched) setClosing(true); else closeCapture(); }, [touched]);
  const startFresh = () => onFresh({ account, instrument, session });
  useEffect(() => {
    const on = () => { if (!done.current) requestClose(); };
    window.addEventListener(CAPTURE_OUTSIDE, on);
    return () => window.removeEventListener(CAPTURE_OUTSIDE, on);
  }, [requestClose]);

  // Keyboard: 0/1/2 score the focused row and move on; ↑ ↓ move; L/S direction; A/B/U scenario; T take; P pass.
  // In the capture phase, before the app's own single-key shortcuts (which would navigate away mid-decision);
  // every other single key is swallowed while Step 1 is open, for the same reason.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA)$/.test(el.tagName))) return;
      if (document.documentElement.dataset.menuOpen || closing || freshAsk || gate || planning) return;
      const k = e.key.toLowerCase();
      const ours = asking ? ['enter', 't', 'escape'] : ['0', '1', '2', 'arrowdown', 'arrowup', 'l', 's', 'a', 'b', 'u', 'g', 'h', 't', 'p', 'm', 'escape'];
      if (ours.includes(k) || e.key.length === 1) { e.stopPropagation(); if (k !== 'escape') e.preventDefault(); }
      if (!ours.includes(k)) return;
      if (asking) {
        if (k === 'enter' || k === 't') { e.preventDefault(); setAsking(false); void save('take', true); }
        else if (k === 'escape') { e.preventDefault(); setAsking(false); }
        return;
      }
      if (k === '0' || k === '1' || k === '2') {
        e.preventDefault();
        score(ROWS[focus].key, Number(k) as 0 | 1 | 2);
      } else if (k === 'arrowdown') { e.preventDefault(); setFocus((f) => Math.min(ROWS.length - 1, f + 1)); }
      else if (k === 'arrowup') { e.preventDefault(); setFocus((f) => Math.max(0, f - 1)); }
      else if (k === 'g') setGap((v) => (v === true ? false : true));
      else if (k === 'h') setHtfOrigin((v) => HTF_ORIGINS[(v == null ? 0 : HTF_ORIGINS.indexOf(v) + 1) % HTF_ORIGINS.length]);
      else if (k === 'l') setDirection('Long');
      else if (k === 's') setDirection('Short');
      else if (k === 'a' || k === 'b' || k === 'u') setScenario(k === 'a' ? 'A' : k === 'b' ? 'B' : 'none');
      else if (k === 't') { e.preventDefault(); decide('take'); }
      else if (k === 'p') { e.preventDefault(); decide('pass'); }
      else if (k === 'm' && expired) { e.preventDefault(); void save('missed'); }
      else if (k === 'escape') { e.preventDefault(); requestClose(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [asking, focus, score, decide, save, expired, closing, requestClose, setGap, gate, planning, freshAsk]);

  return (
    <div data-decide-step className="relative flex flex-1 flex-col">
      {/* Header: the step on the left; the clock, the grade and Close together on the right. */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[20px] font-semibold">New trade <span className="text-[13px] font-medium" style={faint}>· Step 1 of 2 — Decide</span></h1>
          <p className="mt-0.5 text-[12.5px]" style={dim}>
            Score the four rows at the candle close, then Take or Pass. <span className="hidden sm:inline" style={faint}>Keys: G gap · 0 1 2 · ↑ ↓ · L S · A B U · H origin · T P{expired ? ' · M missed' : ''}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Timer timed={timed} left={c.left} elapsed={c.elapsed} limit={limit} tone={c.tone} expired={expired} over={c.over} />
          <GradeChip grade={grade} />
          <FreshButton onClick={() => (touched ? setFreshAsk(true) : startFresh())} />
          <CloseButton onClick={requestClose} title="Close (Esc, or click outside) — asks first if anything is entered" />
        </div>
      </div>
      {/* The session's running tally, the replay day and the Path: one thin strip under the title. */}
      <HeaderStrip backtest={backtest} replay={backtest ? <ReplayDayControl instrument={instrument} /> : null} />

      {/* Fields and rows keep their own size; only the chart grows, so the card reaches the bottom without stretched boxes. */}
      {/* Column 1: the facts. Columns 2 and 3: the four rows, two each (Sweep and Inversion, then Path and Target),
          and the chart across both underneath — wide enough to read — with Take and Pass below it. */}
      <div className="grid flex-1 items-stretch gap-x-6 gap-y-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.2fr)]">
        {/* The facts. */}
        <div className="flex flex-col gap-4" data-facts>
          <div className="grid grid-cols-2 gap-3">
            <Field quiet label="Account" hint="Remembered from the last trade. The clock runs on accounts set to Timed decision (Settings → Trades).">
              <Select value={account} onChange={(v) => setAccount(v as Account)} options={ACCOUNTS} labelFor={accountLabel} />
            </Field>
            <Field quiet label="Instrument">
              <Select value={instrument} onChange={setInstrument} options={INSTRUMENTS} />
            </Field>
          </div>
          <Field quiet label="Session" hint="NY AM by default; Save & next carries the replay’s session over.">
            <Select value={session} onChange={setSession} options={SESSIONS} />
          </Field>
          <Field quiet label="Direction" badge={<Key k="L / S" />} required={!direction} group className={flashing && !direction ? 'need-flash' : ''}>
            <Segmented value={direction ?? ('' as 'Long')} onChange={setDirection} options={['Long', 'Short'] as const} accentFor={directionTone} />
          </Field>
          <Field quiet label="Scenario" badge={<Key k="A / B / U" />} required={!scenario} group className={flashing && !scenario ? 'need-flash' : ''}
            hint={backtest ? 'Chosen every time: A with the bias, B against it, or Unplanned (max B).' : 'Pre-selected from this morning’s plan when its direction matches. Unplanned caps at B.'}>
            <Segmented value={scenario ?? ('' as Scenario)} onChange={(v) => { if (!(noPlan && backtest)) setScenario(v); }}
              options={['A', 'B', 'none'] as const} labelFor={(v) => (v === 'none' ? 'Unplanned' : v)} titleFor={(v) => SCENARIO_LABEL[v]} accentFor={scenarioTone} />
          </Field>
          <Field quiet label="Leg location" hint={LEG_HELP}>
            <Segmented value={leg ?? ('' as LegLocation)} onChange={setLeg} options={LEG_LOCATIONS} accentFor={legTone(direction)} />
          </Field>
          <Field quiet label="HTF origin" badge={<Key k="H" />} group hint="Where the reaction started. A fact only — it never changes the grade.">
            <Segmented value={htfOrigin ?? ('' as HtfOrigin)} onChange={setHtfOrigin} options={HTF_ORIGINS} compact />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field quiet label="Target type" required={!target} className={flashing && !target ? 'need-flash' : ''}>
              <Select value={target} onChange={setTarget} placeholder="Which…" options={TARGET_VALUES} labelFor={targetLabel} />
            </Field>
            <Field quiet label="Entry type">
              <Select value={entry} onChange={setEntry} placeholder="How…" options={ENTRY_VALUES} labelFor={entryLabel} />
            </Field>
          </div>
          <Field quiet label="Planned R" hint="Required — the Target row's thresholds read it. Under 1.5R is no trade." required={!plannedR} group className={flashing && !plannedR ? 'need-flash' : ''}>
            <Segmented value={plannedR ?? ''} onChange={setPlannedR} options={V2_PLANNED_RS} labelFor={(v) => `${v}R`} accentFor={plannedRTone} />
          </Field>
          <Field quiet label="Confidence" hint="Before the outcome — it predicts better than the old checklist did.">
            <Segmented value={confidence ? String(confidence) : ''} onChange={(v) => setConfidence(Number(v))} options={CONFIDENCES} accentFor={confidenceTone} />
          </Field>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
        {/* The gate first: one clean gap, or no trade. Not part of the /8. */}
        <GateBar value={gapOf(gap)} onChange={(v) => setGap(v === 'one')} flash={flashing && gap == null} />
        {/* The rubric: four rows, one tap each, each option's definition on it. Column by column, in key order. */}
        <div className="grid gap-3 xl:grid-flow-col xl:grid-cols-2 xl:grid-rows-2" data-rubric>
          {ROWS.map((r, i) => (
            <RubricRow key={r.key} row={r} value={rows[r.key] ?? null} focused={focus === i} flash={flashing && rows[r.key] == null}
              late={timed && scoredAt[r.key] != null && scoredAt[r.key]! > startedAt + limit * 1000}
              onFocus={() => setFocus(i)} onPick={(v) => score(r.key, v)} />
          ))}
        </div>

        {/* The chart (paste any time — the clock never stops) and the decision. */}
        <div className="flex min-h-0 flex-1 flex-col gap-3" data-decide>
          {/* The plan: always here, one height, plan or not — so the chart below never moves. */}
          {backtest ? (
            <PlanStrip cards={day ? replayCards(day) : null} direction={direction}
              title={day ? `Day ${day.sequence}${day.amended_at ? ' · amended' : ''}` : ''}
              empty={<>no replay day is locked — this trade is <b>Unplanned</b> (max B).</>}
              action={<button type="button" onClick={() => setPlanning(true)} data-plan-now className="shrink-0 rounded-full border px-3 py-1 text-[11.5px] font-medium"
                style={{ borderColor: 'rgb(var(--accent) / 0.45)', background: 'rgb(var(--accent) / 0.1)', color: 'rgb(var(--accent))' }}>Plan this day</button>} />
          ) : (
            <PlanStrip cards={plans && (plans.aDir || plans.bDir || plans.aLine || plans.bLine) ? morningCards(plans) : null} direction={direction}
              title="this morning’s prep"
              empty={<>no chart prep today — pick the scenario by hand, or Unplanned (max B).</>} />
          )}
          {/* The chart box takes only the room the window has left, and the chart is drawn inside it:
              whatever is pasted, the box keeps its size and nothing below it moves — no scrolling. */}
          <div className="flex min-h-[10rem] flex-1 flex-col"><ShotSlots files={slots} onChange={setSlots} grow box="min-h-0 flex-1" /></div>
          <div className="grid items-start gap-x-6 gap-y-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-1.5 md:order-2">
          <div className="relative">
            <div className="grid grid-cols-2 gap-2">
              <DecideButton label="Take" k="T" tone="win" disabled={saving || !ready} onClick={() => decide('take')} data="take" />
              <DecideButton label="Pass" k="P" tone="dim" disabled={saving || !ready} onClick={() => decide('pass')} data="pass" />
            </div>
            <AnimatePresence>
              {asking && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring}
                  className="absolute inset-0 z-10 flex flex-col justify-center gap-2 rounded-[calc(16px*var(--rk))] border px-3 py-2"
                  style={{ background: 'var(--bg-raised)', borderColor: 'rgb(var(--grade-f))' }} data-override role="alertdialog" aria-label={OVERRIDE_PROMPT}>
                  <p className="text-[12.5px] font-semibold" style={{ color: 'rgb(var(--grade-f))' }}>{OVERRIDE_PROMPT}</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => { setAsking(false); void save('take', true); }} className="flex-1 rounded-full px-3 py-1.5 text-[12px] font-semibold"
                      style={{ background: 'rgb(var(--grade-f))', color: 'var(--bg-raised)' }} data-override-take>Take anyway <span className="opacity-70">↵</span></button>
                    <button type="button" onClick={() => setAsking(false)} className="flex-1 rounded-full border px-3 py-1.5 text-[12px]"
                      style={{ borderColor: 'var(--glass-stroke)', color: 'var(--text-dim)' }}>Back <span className="opacity-70">Esc</span></button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {error && <p className="text-[12px]" style={{ color: 'rgb(var(--grade-f))' }} role="alert">{error}</p>}
          </div>
          <div className="space-y-1.5 md:order-1">
          {expired ? (
            <div className="rounded-[calc(14px*var(--rk))] border px-3 py-2 text-[12px]" data-missed
              style={{ borderColor: 'rgb(var(--grade-f) / 0.6)', background: 'color-mix(in srgb, rgb(var(--grade-f)) 6%, transparent)' }}>
              <b style={{ color: 'rgb(var(--grade-f))' }}>Time&rsquo;s up.</b>{' '}
              <span style={dim}>Still your call: Take or Pass stores the real time it took ({Math.round(limit + c.over)} s of {limit} s), or log it as missed.</span>
              <button type="button" onClick={() => void save('missed')} disabled={saving} className="mt-1.5 block text-[11.5px] font-medium underline underline-offset-2" style={{ color: 'rgb(var(--accent))' }} data-save-missed>
                Missed — too slow <span className="no-underline opacity-70">(M)</span>
              </button>
            </div>
          ) : (
            <p className="text-[11.5px] leading-snug" style={faint} data-owed>
              {owed.length ? <>To decide: <b style={dim}>{owed.join(', ')}</b>.</> : 'Ready to decide.'}
              {optional.length > 0 && <> Not set: {optional.join(', ')}.</>}
            </p>
          )}
          <p className="text-[10.5px]" style={faint}>{RUBRIC_V2_LABEL} · locks at the decision · Similar setups and expected R come in Step 2.</p>
          </div>
          </div>
        </div>
        </div>
      </div>
      {gate && (
        <div className="absolute inset-0 z-20 grid place-items-center rounded-[calc(28px*var(--rk))]" style={{ background: 'color-mix(in srgb, var(--bg-raised) 82%, transparent)' }} data-replay-gate>
          <div className="max-w-[30rem] rounded-[20px] border p-5 text-center" style={{ borderColor: 'var(--glass-stroke)', background: 'var(--bg-raised)', boxShadow: 'var(--shadow-panel)' }}>
            <h2 className="text-[16px] font-semibold">No replay day is planned</h2>
            <p className="mt-1 text-[12.5px]" style={dim}>Plan A and B for the day you are replaying (30 seconds of taps), or trade it unplanned — capped at B. The clock starts after.</p>
            <div className="mt-4 flex justify-center gap-2">
              <button type="button" onClick={() => setPlanning(true)} data-gate-plan className="rounded-full px-4 py-2 text-[12.5px] font-semibold" style={{ background: 'rgb(var(--accent))', color: 'var(--bg-raised)' }}>Plan this day</button>
              <button type="button" onClick={() => setNoPlan(true)} data-gate-noplan className="rounded-full border px-4 py-2 text-[12.5px]" style={{ borderColor: 'var(--glass-stroke)', color: 'var(--text-dim)' }}>Trade without a plan</button>
            </div>
          </div>
        </div>
      )}
      <ReplayBuilder open={planning} onClose={() => setPlanning(false)} last={replay?.last ?? null} instrument={instrument} />
      <CloseDialog open={freshAsk} onCancel={() => setFreshAsk(false)}
        title="Start fresh?"
        body={`Clears every answer and the charts, and starts the clock from zero.${noPlanChosen && !day ? ' The replay day asks again: plan it, or trade without.' : ''} Account, instrument and session stay. A locked replay plan stays locked — Amend changes it.`}
        actions={[
          { label: 'Start fresh', primary: true, data: 'fresh', onClick: startFresh },
          { label: 'Keep deciding', data: 'keep', onClick: () => setFreshAsk(false) },
        ]} />
      <CloseDialog open={closing} onCancel={() => setClosing(false)}
        title="Close without deciding?"
        body={expired
          ? 'Time is up. Save it as a pass or a miss, or discard it — a discarded setup leaves no record.'
          : ready ? 'A decision is saved by Take or Pass. Save it as a pass, or discard it — a discarded setup leaves no record.'
          : 'Nothing is saved until you Take or Pass. Discard what you have entered?'}
        actions={[
          ...(ready ? [{ label: 'Save as Passed', primary: true, data: 'pass', onClick: () => { setClosing(false); void save('pass', false, true); } }] : []),
          ...(expired ? [{ label: 'Save as Missed', data: 'missed', onClick: () => { setClosing(false); void save('missed', false, true); } }] : []),
          { label: 'Discard', danger: true, data: 'discard', onClick: () => closeCapture() },
          { label: 'Keep deciding', data: 'keep', onClick: () => setClosing(false) },
        ]} />
    </div>
  );
}

function HeaderStrip({ backtest, replay }: { backtest: boolean; replay?: React.ReactNode }) {
  return (
    <div className="mb-4 mt-2 flex min-h-[1.75rem] flex-wrap items-center gap-2" data-header-strip>
      {replay}
      {backtest && <SessionTally inline />}
      <PathBanner compact />
    </div>
  );
}

function GateBar({ value, onChange, flash = false, readOnly = false }: { value: SingularGap | null; onChange: (v: SingularGap) => void; flash?: boolean; readOnly?: boolean }) {
  const required = value == null && !readOnly;
  return (
    <div data-gate={value ?? ''} className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[calc(16px*var(--rk))] border px-3 py-2 ${flash ? 'need-flash' : ''}`}
      style={{ borderColor: value === 'many' ? 'rgb(var(--outcome-loss) / 0.55)' : 'var(--glass-stroke)', background: value === 'many' ? 'rgb(var(--outcome-loss) / 0.05)' : 'var(--glass-fill)' }}>
      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: required ? 'rgb(var(--accent))' : 'var(--text-faint)' }}>
        {required && <span aria-hidden className="size-1.5 rounded-full" style={{ background: 'rgb(var(--accent))' }} />}
        Gate · {SINGULAR_GAP_QUESTION}
        {required && <span className="font-medium normal-case tracking-normal opacity-75">· required</span>}
        {!readOnly && <Key k="G" />}
      </span>
      <div className="min-w-[16rem]">
        <Segmented value={value ?? ('' as SingularGap)} onChange={onChange} options={['one', 'many'] as const}
          labelFor={(v) => SINGULAR_GAP_LABEL[v]} accentFor={(v) => (v === 'one' ? WIN : LOSS)}
          titleFor={(v) => (v === 'one' ? 'Pass: one clean, unmistakable FVG' : 'Fail: No trade, whatever the rows say')} compact />
      </div>
    </div>
  );
}

function Key({ k }: { k: string }) {
  return <span className="rounded-[5px] border px-1 py-px text-[9.5px] font-medium tabular-nums" style={{ borderColor: 'var(--glass-stroke)', color: 'var(--text-faint)' }}>{k}</span>;
}

function Timer({ timed, left, elapsed, limit, tone, expired, over }: {
  timed: boolean; left: number; elapsed: number; limit: number; tone: 'calm' | 'amber' | 'red'; expired: boolean; over: number;
}) {
  const color = !timed ? 'var(--text-dim)' : expired || tone === 'red' ? 'rgb(var(--grade-f))' : tone === 'amber' ? 'rgb(var(--grade-b))' : 'var(--text)';
  const share = timed ? left / limit : 1;
  const R = 26; const C = 2 * Math.PI * R;
  return (
    <div className="flex items-center gap-2.5" data-timer={timed ? (expired ? 'expired' : tone) : 'untimed'}>
      <div className="relative size-[64px]">
        <svg viewBox="0 0 64 64" className="size-full -rotate-90" aria-hidden>
          <circle cx="32" cy="32" r={R} fill="none" stroke={expired ? 'rgb(var(--grade-f) / 0.35)' : 'var(--glass-stroke)'} strokeWidth="5" />
          {timed && !expired && <circle cx="32" cy="32" r={R} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${share * C} ${C}`} style={{ transition: 'stroke-dasharray 100ms linear, stroke 200ms' }} />}
        </svg>
        <span className={`absolute inset-0 grid place-items-center font-semibold tabular-nums ${expired ? 'text-[18px]' : 'text-[24px]'}`} style={{ color }} data-seconds>
          {timed ? (expired ? `+${Math.floor(over)}` : Math.ceil(left)) : Math.floor(elapsed)}
        </span>
      </div>
      <span className="text-[10.5px] leading-tight" style={{ color: expired ? 'rgb(var(--grade-f))' : 'var(--text-faint)' }}>
        {timed ? (expired ? <>over<br />time</> : <>seconds<br />to decide</>) : <>untimed<br />elapsed</>}
      </span>
    </div>
  );
}

function GradeChip({ grade }: { grade: V2Grade }) {
  const tone = LETTER_TONE[grade.letter];
  return (
    <div className="min-w-[9.5rem] max-w-[17rem] rounded-[calc(16px*var(--rk))] border px-3 py-2" data-grade={grade.letter}
      style={{ borderColor: `color-mix(in srgb, ${tone} 45%, transparent)`, background: `color-mix(in srgb, ${tone} 9%, transparent)` }}>
      <div className="flex items-baseline gap-2">
        <span className="text-[24px] font-semibold leading-none" style={{ color: tone }}>{grade.letter}</span>
        <span className="text-[12px] tabular-nums" style={faint}>{grade.total}/8{grade.missing.length ? ` · ${grade.missing.length} to score` : ''}</span>
      </div>
      <p className="mt-0.5 text-[10.5px] leading-snug" style={dim} data-grade-reason>{grade.missing.length === ROWS.length ? 'Score the rows.' : /^\d+\/8\.$/.test(grade.reason) ? (grade.missing.length ? 'Partial — finish the rows.' : 'No gate or cap.') : grade.reason}</p>
    </div>
  );
}

function RubricRow({ row, value, focused, late, onFocus, onPick, flash = false, readOnly = false }: {
  row: (typeof ROWS)[number]; value: 0 | 1 | 2 | null; focused: boolean; late: boolean; onFocus: () => void; onPick: (v: 0 | 1 | 2) => void;
  flash?: boolean; readOnly?: boolean;
}) {
  const required = value == null && !readOnly;
  const tone = (v: 0 | 1 | 2) => (v === 2 ? 'rgb(var(--grade-a))' : v === 1 ? 'rgb(var(--grade-b))' : 'rgb(var(--grade-f))');
  return (
    <div data-row={row.key} data-focused={focused || undefined} data-score={value ?? ''}
      className={`rounded-[calc(16px*var(--rk))] border p-2.5 transition-colors ${flash ? 'need-flash' : ''}`}
      style={{ borderColor: focused ? 'rgb(var(--accent) / 0.6)' : 'var(--glass-stroke)', background: 'var(--glass-fill)', boxShadow: focused ? '0 0 0 1px rgb(var(--accent) / 0.25)' : undefined }}>
      <div className="mb-1.5 flex cursor-pointer items-center justify-between px-1" onClick={onFocus} title="Focus this row for the 0 / 1 / 2 keys">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: focused || required ? 'rgb(var(--accent))' : 'var(--text-faint)' }}>
          {required && <span aria-hidden className="size-1.5 rounded-full" style={{ background: 'rgb(var(--accent))' }} />}
          {row.label}
          {required && <span className="normal-case tracking-normal font-medium opacity-75">· required</span>}
        </span>
        <span className="text-[10px]" style={faint}>{late ? 'scored after the clock' : focused ? 'press 2 · 1 · 0' : ''}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {([2, 1, 0] as const).map((v) => {
          const on = value === v;
          return (
            <button key={v} type="button" onClick={() => onPick(v)} aria-pressed={on} data-pick={v} disabled={readOnly && !on}
              className="flex h-full min-h-[4.25rem] flex-col justify-start rounded-[calc(12px*var(--rk))] border px-3 py-2 text-left transition-colors"
              style={{ borderColor: on ? tone(v) : 'var(--glass-stroke)', background: on ? `color-mix(in srgb, ${tone(v)} 14%, transparent)` : 'transparent' }}>
              <span className="block text-[15px] font-semibold tabular-nums" style={{ color: on ? tone(v) : 'var(--text-dim)' }}>{v}</span>
              <span className="block mt-0.5 text-[11.5px] leading-snug" style={{ color: on ? 'var(--text)' : 'var(--text-faint)' }}>{row.defs[v]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DecideButton({ label, k, tone, disabled, onClick, data }: { label: string; k: string; tone: 'win' | 'dim'; disabled: boolean; onClick: () => void; data: string }) {
  return (
    <motion.button type="button" onClick={onClick} disabled={disabled} whileTap={press} transition={spring} data-decide-button={data}
      className="flex items-center justify-center gap-2 rounded-[calc(16px*var(--rk))] px-4 py-3 text-[15px] font-semibold disabled:opacity-40"
      style={tone === 'win'
        ? { background: 'rgb(var(--accent))', color: 'var(--bg-raised)', boxShadow: '0 8px 22px -10px rgb(var(--accent) / 0.8)' }
        : { background: 'var(--glass-fill-strong)', color: 'var(--text)', border: '1px solid var(--glass-stroke)' }}>
      {label}<span className="rounded-[5px] border px-1 text-[10px] font-medium opacity-70" style={{ borderColor: 'currentColor' }}>{k}</span>
    </motion.button>
  );
}

/* ═════════════════════════ Step 2 — Outcome ═════════════════════════ */

const ENDED = ['Win', 'Partial win', 'Loss', 'Breakeven', 'Scratched'] as const;
type Ended = (typeof ENDED)[number];
const ENDED_MEANS: Record<Ended, string> = {
  Win: 'Closed in profit at or past the plan.',
  'Partial win': 'In profit, but partials or an early exit left part of the plan on the table.',
  Loss: 'Stopped out, or closed at a loss.',
  Breakeven: 'Stopped at breakeven, after the stop was moved to entry.',
  Scratched: 'Closed by hand around entry (about 0R) before the stop or the target — the idea was gone, so you got out flat.',
};
const V2_MANAGEMENTS = MANAGEMENTS.filter((m) => m !== 'Other');
const num = (s: string) => (s.trim() === '' || !Number.isFinite(Number(s)) ? null : Number(s));

function OutcomeStep({ trade, onNext, onBack }: { trade: Trade; onNext?: () => void; onBack: () => void }) {
  const decision = (trade.decision ?? 'take') as Decision;
  const taken = decision === 'take';
  const backtest = trade.account === BACKTEST;
  const first = trade.outcome_at == null;
  const [ended, setEnded] = useState<Ended | null>(trade.outcome_at && taken ? (trade.outcome === 'Win' && trade.partial_win ? 'Partial win' : trade.outcome as Ended) : null);
  const [r, setR] = useState(trade.r_multiple != null && taken ? String(trade.r_multiple) : '');
  const [pnl, setPnl] = useState(trade.pnl_dollars != null ? String(trade.pnl_dollars) : '');
  const [contracts, setContracts] = useState(trade.contracts != null ? String(trade.contracts) : '');
  const [mfe, setMfe] = useState(trade.mfe_r != null ? String(trade.mfe_r) : '');
  const [reached1R, setReached1R] = useState<boolean | null>(trade.reached_1r);
  const [exit, setExit] = useState<string | null>(trade.exit_reason ?? null);
  const [management, setManagement] = useState<string | null>(trade.management ?? null);
  const [wouldR, setWouldR] = useState(trade.would_be_r != null ? String(trade.would_be_r) : '');
  const [wouldMfe, setWouldMfe] = useState(trade.would_be_mfe_r != null ? String(trade.would_be_mfe_r) : '');
  const [explanation, setExplanation] = useState(trade.explanation ?? '');
  const [lesson, setLesson] = useState(trade.lesson ?? '');
  const [me, setMe] = useState<string[]>(trade.mistake_tags ?? []);
  // Only the tapped market tags live here; the computed two are written on save.
  const [market, setMarket] = useState<string[]>((trade.market_tags ?? []).filter((m) => !(AUTO_MARKET_TAGS as readonly string[]).includes(m)));
  const [worked, setWorked] = useState<string[]>(trade.worked_tags ?? []);
  const [regrade, setRegrade] = useState(trade.regrade ?? null);
  const [tagNote, setTagNote] = useState<string | null>(null);
  // A pass or a miss: why. Tap picks, a second tap makes it the main reason, a third removes it.
  const [reasons, setReasons] = useState<string[]>(trade.pass_reasons ?? []);
  const [mainReason, setMainReason] = useState<string | null>(trade.pass_main_reason ?? null);
  const tapReason = (r: string) => {
    if (!reasons.includes(r)) { setReasons([...reasons, r]); if (!mainReason) setMainReason(r); return; }
    if (mainReason !== r) { setMainReason(r); return; }
    const rest = reasons.filter((x) => x !== r);
    setReasons(rest); setMainReason(rest[0] ?? null);
  };
  const toggleTag = (side: 'me' | 'market' | 'worked', tag: string) => {
    const [list, set] = side === 'me' ? [me, setMe] : side === 'market' ? [market, setMarket] : [worked, setWorked];
    if (list.includes(tag)) { set(list.filter((x) => x !== tag)); setTagNote(null); return; }
    const why = side === 'market' ? null : tagBlocked(tag, { me, worked }, { decision, overTime: overTime(trade) });
    if (why) { setTagNote(why); return; }
    setTagNote(null);
    set([...list, tag]);
  };
  const [drillKey, setDrillKey] = useState<string | null>(trade.drill_key ?? null);
  const [drillKept, setDrillKept] = useState<DrillKept | null>(trade.drill_kept ?? null);
  const [stage, setStage] = useState<'Live' | 'Settled'>(trade.status === 'Live' && !trade.outcome_at ? 'Settled' : (trade.status === 'Live' ? 'Live' : 'Settled'));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [flashing, setFlashing] = useState(false);
  const [similar, setSimilar] = useState<SimilarResult | null>(null);
  const [simLoading, setSimLoading] = useState(true);

  // Now that it is decided: what setups like this one did. Never shown before the decision.
  useEffect(() => {
    let live = true;
    void fetch('/api/similar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draft: trade }) })
      .then((res) => (res.ok ? res.json() : null)).then((s) => { if (live) { setSimilar(s); setSimLoading(false); } })
      .catch(() => { if (live) setSimLoading(false); });
    return () => { live = false; };
  }, [trade]);

  const g = gradeV2(trade);
  const letter = V2_LETTER_OF(trade.grade_letter);
  const entryLetter = (trade.grade_letter ?? 'F') as GradeLetter;
  const regrades = regradeOptions(entryLetter);
  const outcome = ended === 'Partial win' ? 'Win' : ended;
  const verdict = rulesFollowedV2({ grade_override: trade.grade_override, mistake_tags: me, risk_percent: trade.risk_percent }, { maxRiskPct: 1, backtest });
  const flags = consistencyFlags({ mistake_tags: me, market_tags: market, reached_1r: reached1R, management, mfe_r: num(mfe), planned_rr: trade.planned_rr });
  const settled = !taken || stage === 'Settled';
  const autoNow = taken ? autoMarketTags({ mfe_r: num(mfe), planned_rr: trade.planned_rr, exit_reason: exit }) : [];
  // A pass or a miss owes one line of why; the lesson is optional. Taken trades keep 160 + 160.
  const minExplanation = taken ? MIN_EXPLANATION : MIN_PASS_EXPLANATION;
  const lessonRequired = taken && settled;
  const owed = [
    ...(taken && settled && !ended ? ['how it ended'] : []),
    ...(taken && settled && num(r) == null ? ['R'] : []),
    ...(!taken && num(wouldR) == null ? ['what it would have done'] : []),
    ...(!taken && reasons.length === 0 ? [`why it was ${decision === 'pass' ? 'passed' : 'missed'}`] : []),
    ...(explanation.trim().length < minExplanation ? [`explanation (${minExplanation}+)`] : []),
    ...(lessonRequired && lesson.trim().length < MIN_LESSON ? [`lesson (${MIN_LESSON}+)`] : []),
  ];

  // What has been written since the form opened: closing then asks.
  const snapshot = JSON.stringify([ended, r, pnl, contracts, mfe, reached1R, exit, management, wouldR, wouldMfe, explanation, lesson, me, market, worked, regrade, stage, drillKept, reasons, mainReason]);
  const [initial] = useState(snapshot);
  const dirty = snapshot !== initial;
  const requestClose = useCallback(() => { if (dirty) setClosing(true); else closeCapture(); }, [dirty]);
  useEffect(() => {
    window.addEventListener(CAPTURE_OUTSIDE, requestClose);
    return () => window.removeEventListener(CAPTURE_OUTSIDE, requestClose);
  }, [requestClose]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || closing || document.documentElement.dataset.menuOpen) return;
      e.preventDefault(); e.stopPropagation(); requestClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [closing, requestClose]);

  // The trade as written so far, for a drill measured from the fields.
  const draft: Partial<Trade> = {
    ...trade, exit_reason: taken ? exit : null, mfe_r: taken ? num(mfe) : null, would_be_r: taken ? null : num(wouldR),
  };
  // From the drill card: a Step 2 field is scrolled to and focused; a Step 1 field opens the locked Step 1.
  const jumpTo = (field: keyof Trade) => {
    const here: Partial<Record<keyof Trade, string>> = { exit_reason: 'exit', mfe_r: 'mfe', would_be_r: 'would-r', r_multiple: 'r' };
    const key = here[field];
    if (!key) { onBack(); return; }
    const el = document.querySelector<HTMLElement>(`[data-field="${key}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    (el?.querySelector('input, button') as HTMLElement | null ?? el)?.focus();
  };
  const onDrill = useCallback((k: string | null, v: DrillKept | null) => { setDrillKey(k); setDrillKept(v); }, []);

  /** `draft`: keep what is written but leave the outcome unwritten — the trade stays on the Unfinished shelf. */
  const drillCard = <DrillChip drillKey={drillKey} value={drillKept} onChange={onDrill} draft={draft} onJump={jumpTo} />;

  async function save(next = false, draft = false) {
    if (owed.length && !draft) {
      setError(`Still to write: ${owed.join(', ')}.`);
      setFlashing(false); requestAnimationFrame(() => setFlashing(true));
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      ...trade,
      status: taken ? (draft ? (ended ? 'Settled' : 'Live') : stage) : 'Settled',
      outcome: taken ? (draft ? (outcome ?? 'Not taken') : settled ? outcome : 'Not taken') : 'Not taken',
      partial_win: ended === 'Partial win' ? true : outcome === 'Win' ? false : null,
      r_multiple: taken && (settled || draft) ? num(r) : null,
      pnl_dollars: taken ? num(pnl) : null, contracts: taken ? num(contracts) : null,
      mfe_r: taken ? num(mfe) : null, reached_1r: taken ? reached1R : null,
      exit_reason: taken ? exit : null, management: taken ? management : trade.management,
      would_be_r: taken ? null : num(wouldR), would_be_mfe_r: taken ? null : num(wouldMfe),
      explanation: explanation.trim(), lesson: lesson.trim() || null,
      // A pass or a miss carries its reasons instead of tags: execution tags mean nothing on a trade not taken.
      mistake_tags: taken ? me : [], market_tags: taken ? [...market, ...autoNow] : [], worked_tags: taken ? worked : [],
      pass_reasons: taken ? null : reasons, pass_main_reason: taken ? null : mainReason,
      regrade, drill_key: drillKey, drill_kept: drillKey ? drillKept : null,
      // Step 2 is written once settled; a trade still open stays pending.
      outcome_at: draft ? (trade.outcome_at ?? null) : settled ? (trade.outcome_at ?? new Date().toISOString()) : null,
    };
    // Charts live on Step 1 (added there, before or after the decision); Step 2 writes only the outcome.
    const body = new FormData();
    body.append('trade', JSON.stringify(payload));
    try {
      const res = await fetch(`/api/trades/${trade.id}`, { method: 'PUT', body });
      const text = await res.text();
      if (!res.ok) { let msg = text.slice(0, 300); try { msg = JSON.parse(text).error ?? msg; } catch { /* raw */ } throw new Error(msg); }
      window.dispatchEvent(new CustomEvent(TRADE_SAVED, { detail: trade.id }));
      if (next && onNext) {
        writeCarry({ account: trade.account, accountLabel: trade.account_label ?? '', instrument: trade.instrument, session: trade.session, setupType: trade.setup_type, management, reason: trade.reason });
        onNext();
        return;
      }
      closeCapture();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the outcome.');
      setSaving(false);
    }
  }

  return (
    <div data-outcome-step data-decision={decision} className="flex flex-1 flex-col">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[20px] font-semibold">{first ? 'New trade' : 'Edit trade'} <span className="text-[13px] font-medium" style={faint}>· Step 2 of 2 — Outcome</span></h1>
          <p className="mt-0.5 text-[12.5px]" style={dim}>
            Saved at the decision. Write the outcome now or later — until then it counts nowhere.
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          <motion.button type="button" onClick={onBack} whileTap={press} transition={spring} data-back title="Step 1, as it was locked"
            className="rounded-full border px-3 py-1.5 text-[12px]" style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)', color: 'var(--text-dim)' }}>
            ← Step 1
          </motion.button>
          {first && (
            <motion.button type="button" onClick={() => (dirty ? void save(false, true) : closeCapture())} disabled={saving} whileTap={press} transition={spring} data-finish-later
              title="Saves what is written; the trade waits on the Unfinished shelf in Trades"
              className="rounded-full border px-3 py-1.5 text-[12px]" style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)', color: 'var(--text-dim)' }}>
              Finish later
            </motion.button>
          )}
          <CloseButton onClick={requestClose} title="Close (Esc, or click outside) — asks first if anything was written" />
        </div>
      </div>
      <HeaderStrip backtest={backtest} />

      {/* Three equal columns: the locked decision, how it ended, the words. The tags run below them, then Save. */}
      <div className="grid items-stretch gap-x-6 gap-y-5 lg:grid-cols-2 xl:grid-cols-3">
        {/* Step 1, read-only: the decision and its grade. */}
        <div className="flex flex-col gap-3" data-step1-summary>
          <div className="rounded-[calc(18px*var(--rk))] border p-3" style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={faint}>Decision · locked</div>
                <div className="mt-0.5 text-[16px] font-semibold" style={{ color: decision === 'missed' ? 'rgb(var(--grade-f))' : 'var(--text)' }} data-decision-label>
                  {DECISION_LABEL[decision]}
                  {trade.grade_override && <span className="ml-1.5 rounded-full px-1.5 py-px text-[10px]" style={{ background: 'color-mix(in srgb, rgb(var(--grade-f)) 15%, transparent)', color: 'rgb(var(--grade-f))' }}>override</span>}
                </div>
                <div className="text-[11.5px] tabular-nums" style={dim}>
                  {trade.decision_seconds != null ? `${trade.decision_seconds}s` : '—'}{trade.decision_limit ? ` of ${trade.decision_limit}s` : ' · untimed'}
                  {trade.late_rows?.length ? ` · ${trade.late_rows.length} row${trade.late_rows.length === 1 ? '' : 's'} after the clock` : ''}
                </div>
              </div>
              <div className="text-right">
                <span className="text-[24px] font-semibold leading-none" style={{ color: LETTER_TONE[letter ?? 'No trade'] }} data-locked-letter>{letter ?? '—'}</span>
                <div className="text-[11px] tabular-nums" style={faint}>{g.total}/8 · v2</div>
              </div>
            </div>
            {(g.gate || g.caps.length > 0 || g.lowR) && <p className="mt-1.5 text-[11px]" style={dim} data-locked-reason>{g.reason}</p>}
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {ROWS.map((row) => {
                const v = trade[row.key];
                return (
                  <div key={row.key} className="rounded-[10px] border px-1.5 py-1 text-center" style={{ borderColor: 'var(--glass-stroke)' }} title={v == null ? 'Not scored' : row.defs[v as 0 | 1 | 2]}>
                    <div className="text-[9.5px] uppercase tracking-[0.06em]" style={faint}>{row.label}</div>
                    <div className="text-[15px] font-semibold tabular-nums" style={{ color: v === 2 ? 'rgb(var(--grade-a))' : v === 1 ? 'rgb(var(--grade-b))' : v === 0 ? 'rgb(var(--grade-f))' : 'var(--text-faint)' }}>{v ?? '—'}</div>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] leading-snug" style={faint}>
              {gapOf(trade.singular_gap) ? SINGULAR_GAP_LABEL[gapOf(trade.singular_gap)!] : 'gap —'} · {trade.direction} · {trade.plan_scenario ? SCENARIO_LABEL[trade.plan_scenario] : 'no scenario'} · leg {trade.leg_location ?? '—'} · HTF origin {trade.htf_origin ?? '—'} · target {trade.target_type} · {trade.entry_method ?? 'entry —'} · plan {trade.planned_rr ? `${trade.planned_rr}R` : '—'} · confidence {trade.confidence_at_entry ?? '—'}
            </p>
          </div>
          {/* Placed so the three columns end level above the tag row (they balance differently once taken). */}
          {taken ? <>{drillCard}<DecisionReplay trade={trade} /></> : <><DecisionReplay trade={trade} /><RubricProgress /></>}
        </div>

        {/* How it ended — or, for a pass or a miss, what it would have done. */}
        <div className="flex flex-col gap-3" data-outcome-fields>
          {taken ? (
            <>
              <Field quiet label="Stage" hint="Still open: save it and write the result later.">
                <Segmented value={stage} onChange={setStage} options={['Live', 'Settled'] as const} labelFor={(v) => (v === 'Live' ? 'Still open' : 'Closed')} compact />
              </Field>
              {stage === 'Settled' && (
                <Field quiet label="How it ended" group required={!ended} className={flashing && !ended ? 'need-flash' : ''}>
                  <Segmented value={ended ?? ('' as Ended)} onChange={setEnded} options={ENDED} accentFor={endedTone} titleFor={(e) => ENDED_MEANS[e]} />
                </Field>
              )}
              <div className="grid grid-cols-3 gap-3">
                <Field quiet label="R" required={settled && num(r) == null} className={flashing && settled && num(r) == null ? 'need-flash' : ''}><Input inputMode="decimal" value={r} onChange={(e) => setR(e.target.value)} placeholder="e.g. 2 or −1" data-field="r" /></Field>
                <Field quiet label="P&L $"><Input inputMode="decimal" value={pnl} onChange={(e) => setPnl(e.target.value)} placeholder="—" /></Field>
                <Field quiet label="Contracts"><Input inputMode="numeric" value={contracts} onChange={(e) => setContracts(e.target.value)} placeholder="—" /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field quiet label="Max R (MFE)"><Input inputMode="decimal" value={mfe} onChange={(e) => setMfe(e.target.value)} placeholder="—" data-field="mfe" /></Field>
                <Field quiet label="Reached +1R before the stop">
                  <Segmented value={reached1R == null ? '' : reached1R ? 'Yes' : 'No'} onChange={(v) => setReached1R(v === 'Yes')} options={['Yes', 'No']} accentFor={yesNoTone} compact />
                </Field>
              </div>
              <div data-field="exit">
                <Field quiet label="Exit" group>
                  <Segmented value={exit ?? ''} onChange={setExit} options={EXIT_REASONS} accentFor={exitTone} compact />
                </Field>
              </div>
              <Field quiet label="Management plan">
                <Select value={management} onChange={setManagement} placeholder="Which plan?" options={V2_MANAGEMENTS} />
              </Field>
            </>
          ) : (
            <div className="space-y-3 rounded-[calc(18px*var(--rk))] border p-3" data-hypothetical
              style={{ borderColor: 'rgb(var(--accent) / 0.35)', background: 'rgb(var(--accent) / 0.05)' }}>
              <p className="text-[12px]" style={dim}>
                <b style={{ color: 'var(--text)' }}>{decision === 'missed' ? 'Missed — what would it have done?' : 'Passed — what would it have done?'}</b>{' '}
                Required: a log of only the misses that won is the bias this fixes.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Field quiet label="R it would have made" required={num(wouldR) == null} className={flashing && num(wouldR) == null ? 'need-flash' : ''}><Input inputMode="decimal" value={wouldR} onChange={(e) => setWouldR(e.target.value)} placeholder="e.g. −1 or 2.5" data-field="would-r" /></Field>
                <Field quiet label="Max R, if known"><Input inputMode="decimal" value={wouldMfe} onChange={(e) => setWouldMfe(e.target.value)} placeholder="—" /></Field>
              </div>
            </div>
          )}
          {taken ? <RubricProgress /> : drillCard}
        </div>

        {/* The words, and what they add up to. */}
        <div className="flex flex-col gap-3 lg:col-span-2 xl:col-span-1" data-words>
          <Field quiet label="Explanation" required={explanation.trim().length < minExplanation} className={flashing && explanation.trim().length < minExplanation ? 'need-flash' : ''}>
            <ExplanationField value={explanation} onChange={setExplanation} minChars={minExplanation} minRows={taken ? 4 : 2}
              placeholder={taken ? 'What you saw and why you decided as you did.' : `One line: why it was ${decision === 'pass' ? 'passed' : 'missed'}.`} />
          </Field>
          <Field quiet label={taken ? 'Lesson' : 'Lesson (optional)'} required={lessonRequired && lesson.trim().length < MIN_LESSON} className={flashing && lessonRequired && lesson.trim().length < MIN_LESSON ? 'need-flash' : ''}>
            <ExplanationField value={lesson} onChange={setLesson} placeholder="What would you do differently?" minChars={MIN_LESSON} minRows={taken ? 3 : 2} required={lessonRequired} />
          </Field>
          {taken && (
            <div className="rounded-[calc(14px*var(--rk))] border px-3 py-2 text-[12px]" data-rules-followed={verdict.followed ? 'yes' : 'no'}
              style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }}>
              <span className="font-semibold">Followed all rules: </span>
              <span style={{ color: verdict.followed ? 'rgb(var(--grade-a))' : 'rgb(var(--grade-f))' }}>{verdict.followed ? 'Yes' : 'No'}</span>
              {!verdict.followed && <span style={dim}> — {verdict.reasons.join('; ')}</span>}
              <span className="block text-[10.5px]" style={faint}>Computed: the override and the &ldquo;me&rdquo; tags below; day rules{backtest ? ' do not apply to backtests' : ' are added on save'}.</span>
            </div>
          )}
          {flags.length > 0 && (
            <ul className="space-y-1 text-[11.5px]" data-consistency>
              {flags.map((f) => <li key={f} className="rounded-[10px] px-2.5 py-1.5" style={{ background: 'color-mix(in srgb, rgb(var(--grade-b)) 12%, transparent)', color: 'var(--text)' }}>⚠ {f}</li>)}
            </ul>
          )}
          <Field quiet label="Honest re-grade" hint={`${REGRADE_HINT} Stored, never counted in stats or expectancy.`}>
            <Select value={regrade} onChange={setRegrade} placeholder="Not re-graded" options={regrades} />
          </Field>
          <SimilarCard s={similar} loading={simLoading} />
        </div>
      </div>

      {/* The three tag lists under a rule: ME and WORKED as mirrored 3 × 4 grids (an opposite sits at the
          same place on the other side), MARKET between them as 2 × 3 — the same height, side by side. */}
      {!taken ? (
        <ReasonRow decision={decision} reasons={reasons} main={mainReason} onTap={tapReason} flash={flashing && reasons.length === 0} />
      ) : (
      <div className="mt-5 grid items-stretch gap-x-6 gap-y-4 border-t pt-4 md:grid-cols-[5fr_3fr_5fr]" style={{ borderColor: 'var(--glass-stroke)' }} data-tags>
        <TagBlock title="What went wrong — me" help="Execution and management only. Each one is a rule broken. Its opposite sits at the same place under What worked.">
          <TagGrid cols={3} tone="loss" options={tagOptions(ME_TAGS as readonly string[], trade.mistake_tags)} value={me}
            onToggle={(tag) => toggleTag('me', tag)} blocked={(tag) => tagBlocked(tag, { me, worked }, { decision, overTime: overTime(trade) })} data="me" />
        </TagBlock>
        <TagBlock title="What went wrong — market" help="Outside your control, never a rule broken. The two marked auto are computed from Max R, the planned R and the exit.">
          <TagGrid cols={2} tone="market" options={[...tagOptions(MARKET_TAGS_V2 as readonly string[], market), ...AUTO_MARKET_TAGS]} value={[...market, ...autoNow]}
            auto={AUTO_MARKET_TAGS as readonly string[]} onToggle={(tag) => toggleTag('market', tag)} blocked={() => null} data="market" />
        </TagBlock>
        <TagBlock title="What worked">
          <TagGrid cols={3} tone="win" options={tagOptions(WORKED_TAGS_V2 as readonly string[], trade.worked_tags)} value={worked}
            onToggle={(tag) => toggleTag('worked', tag)} blocked={(tag) => tagBlocked(tag, { me, worked }, { decision, overTime: overTime(trade) })} data="worked" />
        </TagBlock>
        {tagNote && <p className="text-[11.5px] md:col-span-3" style={{ color: 'rgb(var(--grade-b))' }} role="status" data-tag-note>{tagNote}</p>}
      </div>
      )}

      {/* Spare height goes here, under the tags — never as a gap above them. */}
      <div className="flex-1" aria-hidden />
      {/* Save, along the bottom. */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4" style={{ borderColor: 'var(--glass-stroke)' }}>
        <div className="min-w-0 text-[11px] leading-snug" style={faint}>
          {error && <p className="text-[12px]" style={{ color: 'rgb(var(--grade-f))' }} role="alert">{error}</p>}
          {owed.length > 0 && <p>Still to write: {owed.join(', ')}.</p>}
          <p className="text-[10.5px]">{RUBRIC_V2_LABEL} · the decision and its grade stay as they were locked.</p>
        </div>
        <div className="flex gap-2">
          {backtest && onNext && first && (
            <motion.button type="button" onClick={() => void save(true)} disabled={saving} whileTap={press} transition={spring} data-save-next
              className="rounded-full border px-5 py-2.5 text-[13px] font-medium disabled:opacity-50"
              style={{ borderColor: 'rgb(var(--accent) / 0.5)', color: 'rgb(var(--accent))' }}>
              Save &amp; next
            </motion.button>
          )}
          <motion.button type="button" onClick={() => void save(false)} disabled={saving} whileTap={press} transition={spring} data-save-outcome
            className="min-w-[12rem] rounded-full px-6 py-2.5 text-[13.5px] font-semibold disabled:opacity-50"
            style={{ background: 'rgb(var(--accent))', color: 'var(--bg-raised)' }}>
            {saving ? 'Saving…' : 'Save'}
          </motion.button>
        </div>
      </div>

      <CloseDialog open={closing} onCancel={() => setClosing(false)}
        title="Save before closing?"
        body={!owed.length ? 'Save what you wrote, or close and lose it.'
          : first ? `Still to write: ${owed.join(', ')}. Save what you have — the trade waits on the Unfinished shelf in Trades — or close without it.`
          : `Still to write: ${owed.join(', ')}. Finish them to save, or close without the changes.`}
        actions={[
          ...(!owed.length ? [{ label: 'Save & close', primary: true, data: 'save', onClick: () => { setClosing(false); void save(false); } }]
            : first ? [{ label: 'Save as unfinished', primary: true, data: 'draft', onClick: () => { setClosing(false); void save(false, true); } }] : []),
          { label: 'Close without saving', danger: true, data: 'discard', onClick: () => closeCapture() },
          { label: 'Keep writing', data: 'keep', onClick: () => setClosing(false) },
        ]} />
    </div>
  );
}

/** Why I passed / why I missed: the full-width row a pass or a miss gets instead of the tags. */
function ReasonRow({ decision, reasons, main, onTap, flash }: { decision: Decision; reasons: string[]; main: string | null; onTap: (r: string) => void; flash: boolean }) {
  const title = decision === 'pass' ? 'Why I passed' : 'Why I missed';
  const required = reasons.length === 0;
  return (
    <div className="mt-5 border-t pt-4" style={{ borderColor: 'var(--glass-stroke)' }} data-reasons={reasons.length}>
      <span className="mb-1 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: required ? 'rgb(var(--accent))' : 'var(--text-faint)' }}>
        {required && <span aria-hidden className="size-1.5 rounded-full" style={{ background: 'rgb(var(--accent))' }} />}
        {title}{required && <span className="font-medium normal-case tracking-normal opacity-75">· required</span>}
        <Help>Pick every reason that applies. Tap a picked one again to make it the main reason (★); a third tap removes it. Stats compares them — fear passes against rule passes.</Help>
      </span>
      <div className={`grid grid-cols-2 gap-1.5 rounded-[calc(16px*var(--rk))] border p-2 md:grid-cols-4 ${flash ? 'need-flash' : ''}`}
        style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }}>
        {PASS_REASONS.map((r) => {
          const on = reasons.includes(r);
          const isMain = main === r && on;
          return (
            <button key={r} type="button" onClick={() => onTap(r)} aria-pressed={on} data-reason={r} data-main={isMain || undefined}
              className="flex min-h-[2.5rem] items-center justify-center gap-1.5 rounded-[calc(11px*var(--rk))] border px-2 py-1.5 text-[12px] transition-colors"
              style={{
                borderColor: isMain ? 'rgb(var(--accent))' : on ? 'rgb(var(--accent) / 0.45)' : 'transparent',
                background: on ? `rgb(var(--accent) / ${isMain ? 0.16 : 0.08})` : 'transparent',
                color: on ? 'rgb(var(--accent))' : 'var(--text-dim)', fontWeight: isMain ? 600 : 400,
              }}>
              {isMain && <span aria-label="main reason">★</span>}{r}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** From open to decision: when each row and the gate were scored, and which took longest (048). */
function DecisionReplay({ trade }: { trade: Trade }) {
  const r = decisionReplay(trade);
  // The scale is what happened (the limit is drawn only when it falls inside), so close answers stay apart.
  const end = (Math.max(r?.total ?? 0, ...(r?.marks.map((m) => m.at) ?? [0])) || 1) * 1.04;
  return (
    <section className="rounded-[calc(16px*var(--rk))] border p-3" style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }} data-decision-replay={r ? r.marks.length : 0}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={faint}>Decision replay</span>
        <span className="text-[11px] tabular-nums" style={dim}>{trade.decision_seconds ?? '—'}s{trade.decision_limit ? ` of ${trade.decision_limit}s` : ''}</span>
      </div>
      {!r ? (
        <p className="mt-1 text-[11.5px]" style={faint}>No timings on this trade — they are kept from Step 1 on trades decided from now on.</p>
      ) : (
        <>
          <div className="relative mx-3 mt-5 mb-4 h-6" aria-hidden>
            <div className="absolute inset-x-0 top-1/2 h-px" style={{ background: 'var(--glass-stroke)' }} />
            {trade.decision_limit != null && trade.decision_limit <= end && (
              <div className="absolute top-0 h-full w-px" style={{ left: `${(trade.decision_limit / end) * 100}%`, background: 'rgb(var(--grade-f) / 0.5)' }} title="The limit" />
            )}
            {r.marks.map((m, i) => (
              <div key={m.key} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${(m.at / end) * 100}%` }} title={`${m.label} at ${m.at}s (+${m.took}s)`}>
                <span className="block size-2.5 rounded-full border-2" style={{ borderColor: 'rgb(var(--accent))', background: r.slowest?.label === m.label ? 'rgb(var(--accent))' : 'var(--bg-raised)' }} />
                {/* Labels alternate above and below the line, so neighbours never sit on each other. */}
                <span className={`absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[9.5px] ${i % 2 ? 'top-3' : 'bottom-3'}`} style={faint}>{m.label}</span>
              </div>
            ))}
            <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${((trade.decision_seconds ?? r.total) / end) * 100}%` }}>
              <span className="block h-3.5 w-1 rounded-full" style={{ background: 'var(--text)' }} title="Decided" />
            </div>
          </div>
          <p className="mt-1 text-[11px] tabular-nums" style={dim}>
            {r.slowest && <>Longest: <b style={{ color: 'var(--text)' }}>{r.slowest.label}</b> (+{r.slowest.took}s). </>}
            {r.marks.map((m) => `${m.label} ${m.at}s`).join(' · ')}
          </p>
        </>
      )}
    </section>
  );
}

/** Rubric v2 trades logged toward the first review; from ten, R per trade by rubric total. */
function RubricProgress() {
  const [p, setP] = useState<{ logged: number; firstReview: number; showFrom: number; byTotal: Array<{ total: number; n: number; avgR: number | null }> | null } | null>(null);
  useEffect(() => { void fetch('/api/decision-progress').then((r) => (r.ok ? r.json() : null)).then(setP).catch(() => {}); }, []);
  if (!p) return null;
  const share = Math.min(1, p.logged / p.firstReview);
  return (
    <section className="rounded-[calc(16px*var(--rk))] border p-3" style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }} data-rubric-progress={p.logged}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={faint}>Rubric v2 progress</span>
        <span className="text-[11px] tabular-nums" style={dim}><b style={{ color: 'var(--text)' }}>{p.logged}</b> / {p.firstReview} until the first review</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--glass-stroke)' }}>
        <div className="h-full rounded-full" style={{ width: `${share * 100}%`, background: 'rgb(var(--accent))' }} />
      </div>
      {p.byTotal ? (
        <div className="mt-2 grid grid-cols-[auto_1fr_auto] gap-x-3 gap-y-0.5 text-[11px] tabular-nums">
          {p.byTotal.map((b) => (
            <div key={b.total} className="contents">
              <span style={faint}>{b.total}/8</span>
              <span style={{ color: (b.avgR ?? 0) >= 0 ? 'rgb(var(--outcome-win))' : 'rgb(var(--outcome-loss))' }}>{b.avgR == null ? '—' : `${b.avgR >= 0 ? '+' : '−'}${Math.abs(b.avgR).toFixed(2)}R`}</span>
              <span style={faint}>n {b.n}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-1.5 text-[11px]" style={faint}>Numbers by rubric total appear from {p.showFrom} trades — fewer would be noise.</p>
      )}
    </section>
  );
}

/**
 * Tags as an even grid (positions matter: ME and WORKED mirror each other).
 * A blocked tag is dimmed and says why; an auto tag is computed, never
 * tapped, and shows lit when it applies.
 */
function TagGrid({ options, value, onToggle, blocked, cols, tone, auto = [], data }: {
  options: readonly string[]; value: readonly string[]; onToggle: (tag: string) => void; blocked: (tag: string) => string | null;
  cols: 2 | 3; tone: 'loss' | 'win' | 'market'; auto?: readonly string[]; data: string;
}) {
  const hue = tone === 'win' ? 'var(--outcome-win)' : tone === 'market' ? 'var(--amber)' : 'var(--outcome-loss)';
  return (
    <div className={`grid h-full auto-rows-fr gap-1.5 rounded-[calc(16px*var(--rk))] border p-2 ${cols === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}
      style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }} data-tag-grid={data}>
      {options.map((tag) => {
        const on = value.includes(tag);
        const isAuto = auto.includes(tag);
        const why = on || isAuto ? null : blocked(tag);
        return (
          <button key={tag} type="button" disabled={isAuto} aria-pressed={on} data-tag={tag} data-blocked={why ? 'true' : undefined}
            onClick={() => onToggle(tag)} title={isAuto ? 'Computed from Max R, the planned R and the exit — not tapped' : why ?? undefined}
            className="relative flex min-h-[2.5rem] items-center justify-center rounded-[calc(11px*var(--rk))] border px-2 py-1.5 text-center text-[11.5px] leading-snug transition-colors"
            style={{
              borderColor: on ? `rgb(${hue} / 0.6)` : 'transparent',
              background: on ? `rgb(${hue} / 0.12)` : 'transparent',
              color: on ? `rgb(${hue})` : isAuto ? 'var(--text-faint)' : why ? 'var(--text-faint)' : 'var(--text-dim)',
              opacity: why ? 0.55 : 1,
            }}>
            {tag}
            {isAuto && <span className="absolute right-1 top-0.5 text-[8.5px] font-semibold uppercase tracking-[0.06em]" style={{ color: 'var(--text-faint)' }}>auto</span>}
          </button>
        );
      })}
    </div>
  );
}

function TagBlock({ title, help, children }: { title: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="mb-1 flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={faint}>
        {title}{help && <Help>{help}</Help>}
      </span>
      {children}
    </div>
  );
}


/* ═════════════════════════ closing ═════════════════════════ */

function FreshButton({ onClick }: { onClick: () => void }) {
  return (
    <motion.button type="button" onClick={onClick} whileTap={press} transition={spring} data-start-fresh title="Start fresh — clear the answers and restart the clock" aria-label="Start fresh"
      className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px]"
      style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)', color: 'var(--text-dim)' }}>
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden><path d="M2 6a4 4 0 1 0 1.2-2.85M2 1.8v2.4h2.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      Start fresh
    </motion.button>
  );
}

/** This morning's prep A and B, as plan cards. */
const morningCards = (p: { aDir: string | null; bDir: string | null; aLine: string | null; bLine: string | null }): PlanCard[] =>
  [{ k: 'a', dir: p.aDir, line: p.aLine }, { k: 'b', dir: p.bDir, line: p.bLine }];

function CloseButton({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <motion.button type="button" onClick={onClick} whileTap={press} transition={spring} data-close title={title} aria-label="Close"
      className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px]"
      style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)', color: 'var(--text-dim)' }}>
      Close
      <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
    </motion.button>
  );
}

interface CloseAction { label: string; onClick: () => void; data: string; primary?: boolean; danger?: boolean }

/**
 * "Save it?" before the window closes. Enter takes the first action, Esc
 * goes back to the form. Drawn over the whole window, so it is never
 * clipped by the card.
 */
function CloseDialog({ open, title, body, actions, onCancel }: {
  open: boolean; title: string; body: string; actions: CloseAction[]; onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel(); }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); actions[0]?.onClick(); }
      else if (e.key.length === 1) e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, actions, onCancel]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[90] grid place-items-center p-4" style={{ background: 'rgb(0 0 0 / 0.28)' }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }} data-no-drag>
          <motion.div role="alertdialog" aria-label={title} data-close-dialog initial={{ opacity: 0, y: 10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={spring}
            className="w-full max-w-[26rem] rounded-[calc(22px*var(--rk))] border p-5"
            style={{ background: 'var(--bg-raised)', borderColor: 'var(--glass-stroke)', boxShadow: 'var(--shadow-panel)' }}>
            <h2 className="text-[16px] font-semibold">{title}</h2>
            <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: 'var(--text-dim)' }}>{body}</p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              {actions.map((a, i) => (
                <button key={a.data} type="button" onClick={a.onClick} data-close-action={a.data} autoFocus={i === 0}
                  className="rounded-full border px-4 py-2 text-[12.5px] font-semibold"
                  style={a.primary
                    ? { background: 'rgb(var(--accent))', borderColor: 'rgb(var(--accent))', color: 'var(--bg-raised)' }
                    : a.danger
                      ? { borderColor: 'rgb(var(--outcome-loss) / 0.55)', color: 'rgb(var(--outcome-loss))' }
                      : { borderColor: 'var(--glass-stroke)', color: 'var(--text-dim)' }}>
                  {a.label}{i === 0 && <span className="ml-1.5 opacity-60">↵</span>}
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ═════════════════════════ Step 1, locked ═════════════════════════ */

/**
 * The charts on a decided trade, on Step 1 where they belong: the saved ones
 * as thumbnails, and the paste area for more. A pasted chart is added at
 * once (the first becomes the trade's own chart when it had none).
 */
function TradeCharts({ tradeId }: { tradeId: string }) {
  const [saved, setSaved] = useState<Array<{ id: string; path: string; slot: string }>>([]);
  const [files, setFiles] = useState<SlotFiles>({});
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    void fetch(`/api/trades/${tradeId}/shots`).then((r) => (r.ok ? r.json() : [])).then(setSaved).catch(() => {});
  }, [tradeId]);
  useEffect(() => { load(); }, [load]);
  const add = async (next: SlotFiles) => {
    setFiles(next);
    const fresh = SHOT_SLOTS.filter((s) => next[s] && next[s] !== files[s]);
    if (!fresh.length) return;
    setBusy(true);
    for (const s of fresh) {
      const f = new FormData(); f.append('screenshot', next[s]!); f.append('slot', s);
      await fetch(`/api/trades/${tradeId}/shots`, { method: 'POST', body: f }).catch(() => {});
    }
    setBusy(false);
    setFiles({});
    load();
    window.dispatchEvent(new CustomEvent(TRADE_SAVED, { detail: tradeId }));
  };
  return (
    <div className="flex min-h-[14rem] flex-1 flex-col gap-2" data-trade-charts={saved.length}>
      {saved.length > 0 && (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {saved.map((s) => (
            <a key={s.id} href={`/api/screenshots/${s.path}`} target="_blank" rel="noreferrer" className="relative block overflow-hidden rounded-[calc(12px*var(--rk))] border"
              style={{ borderColor: 'var(--glass-stroke)' }} title={`${s.slot} — open full size`}>
              <img src={`/api/screenshots/${s.path}?w=480`} alt={`${s.slot} chart`} className="aspect-[16/10] w-full object-cover" />
              <span className="absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-[10.5px]" style={{ background: 'var(--glass-fill-strong)', color: 'var(--text-dim)' }}>{s.slot}</span>
            </a>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1"><ShotSlots files={files} onChange={(n) => void add(n)} grow /></div>
      {busy && <p className="text-[11px]" style={faint}>Adding…</p>}
    </div>
  );
}

const noop = () => {};

/**
 * Step 1 as it was locked, from Step 2's "← Step 1": the same layout, every
 * answer shown, nothing changeable — the decision is the record of that
 * moment. "Step 2 →" goes back to what you were writing.
 */
function LockedStep1({ trade, onForward, onEdited }: { trade: Trade; onForward: () => void; onEdited: (t: Trade) => void }) {
  // Step 1 can be edited once (049): the answers and the grade; never the decision or its clock.
  const [asking, setAsking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Step1Answers>(() => step1Answers(trade as unknown as Record<string, unknown>));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const shown = (editing ? { ...trade, ...draft } : trade) as Trade;
  const set = (k: Step1Key, v: string | number | boolean | null) => setDraft((d) => ({ ...d, [k]: v }));
  const changed = STEP1_EDITABLE.filter((k) => (draft[k] ?? null) !== ((trade as unknown as Record<string, unknown>)[k] ?? null));
  const g = gradeV2(shown);
  const letter = editing ? (g.missing.length ? 'No trade' : V2_LETTER_OF(storedGrade(g).letter) ?? 'No trade') : V2_LETTER_OF(trade.grade_letter) ?? 'No trade';
  const decision = (trade.decision ?? 'take') as Decision;
  const rowsOf = (k: RowKey) => (shown[k] ?? null) as 0 | 1 | 2 | null;
  const ro = editing ? '' : 'pointer-events-none';
  const on = <T,>(k: Step1Key) => (editing ? (v: T) => set(k, v as never) : noop);
  const original = trade.step1_original;
  const after = step1EditedAfterOutcome(trade);

  const saveEdit = async () => {
    if (!changed.length) { setEditing(false); return; }
    setSaving(true); setError(null);
    const res = await fetch(`/api/trades/${trade.id}/step1`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(changed.map((k) => [k, draft[k] ?? null]))),
    }).catch(() => null);
    const body = res ? await res.json().catch(() => null) : null;
    setSaving(false);
    if (!res || !res.ok) { setError(body?.error ?? 'Could not save the edit.'); return; }
    setEditing(false);
    onEdited(body as Trade);
  };

  return (
    <div data-locked-step1={editing ? 'editing' : trade.step1_edited_at ? 'edited' : 'locked'} className="flex flex-1 flex-col">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[20px] font-semibold">New trade <span className="text-[13px] font-medium" style={faint}>· Step 1 of 2 — Decide · {editing ? 'editing (once)' : trade.step1_edited_at ? 'edited once' : 'locked'}</span></h1>
          <p className="mt-0.5 text-[12.5px]" style={dim}>
            {DECISION_LABEL[decision]} in {trade.decision_seconds ?? '—'}s{trade.decision_limit ? ` of ${trade.decision_limit}s` : ' (untimed)'}
            {trade.decided_at && <> · {new Date(trade.decided_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</>}
            {' '}· {editing ? 'the decision and its time stay; the answers and the grade change.' : trade.step1_edited_at ? 'its one edit is used — nothing more can change.' : 'locked; it can be edited once.'}
          </p>
          {trade.step1_edited_at && original && !editing && (
            <p className="mt-1 text-[11.5px]" style={faint} data-step1-original>
              Edited {new Date(trade.step1_edited_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              {' '}· was <b style={dim}>{V2_LETTER_OF(original.letter) ?? 'No trade'}</b>
              {(() => {
                const was = STEP1_EDITABLE.filter((k) => (original.answers[k] ?? null) !== ((trade as unknown as Record<string, unknown>)[k] ?? null));
                return was.length ? <> · changed: {was.map((k) => `${STEP1_LABEL[k]} ${fmt(original.answers[k])} → ${fmt((trade as unknown as Record<string, unknown>)[k])}`).join(', ')}</> : null;
              })()}
              {after && <> · <span style={{ color: 'rgb(var(--amber))' }}>after the outcome — left out of the v2 sample</span></>}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
        <div className="rounded-[calc(16px*var(--rk))] border px-3 py-2" style={{ borderColor: `color-mix(in srgb, ${LETTER_TONE[letter]} 45%, transparent)`, background: `color-mix(in srgb, ${LETTER_TONE[letter]} 9%, transparent)` }} data-locked-grade={letter}>
          <span className="text-[24px] font-semibold leading-none" style={{ color: LETTER_TONE[letter] }}>{letter}</span>
          <span className="ml-2 text-[12px] tabular-nums" style={faint}>{g.total}/8 · v2</span>
          {(g.gate || g.caps.length > 0 || g.lowR) && <p className="mt-0.5 max-w-[16rem] text-[10.5px]" style={dim}>{g.reason}</p>}
        </div>
        {editing ? <>
          <Button onClick={() => { setEditing(false); setDraft(step1Answers(trade as unknown as Record<string, unknown>)); setError(null); }}>Cancel</Button>
          <Button variant="primary" onClick={() => void saveEdit()} disabled={saving || !changed.length} data-save-step1>Save the edit</Button>
        </> : <>
          {!trade.step1_edited_at && <Button onClick={() => setAsking(true)} data-edit-step1>Edit Step 1 · once</Button>}
          <motion.button type="button" onClick={onForward} whileTap={press} transition={spring} data-forward
            className="rounded-full px-4 py-1.5 text-[12.5px] font-semibold" style={{ background: 'rgb(var(--accent))', color: 'var(--bg-raised)' }}>
            Step 2 →
          </motion.button>
        </>}
        </div>
      </div>
      {error && <p className="-mt-2 mb-3 text-[12px]" style={{ color: 'rgb(var(--grade-f))' }} role="alert">{error}</p>}

      <div className="grid flex-1 items-stretch gap-x-6 gap-y-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.2fr)]">
        <div className={`${ro} flex flex-col gap-4`} aria-readonly={!editing}>
          <div className="pointer-events-none grid grid-cols-2 gap-3">
            <Field quiet label="Account"><Select value={trade.account} onChange={noop} options={[trade.account]} labelFor={(a) => accountLabel(a as Account)} disabled /></Field>
            <Field quiet label="Instrument"><Select value={trade.instrument} onChange={noop} options={[trade.instrument]} disabled /></Field>
          </div>
          <div className="pointer-events-none"><Field quiet label="Session"><Select value={trade.session} onChange={noop} options={[trade.session]} disabled /></Field></div>
          <Field quiet label="Direction" group><Segmented value={shown.direction} onChange={on('direction')} options={['Long', 'Short'] as const} accentFor={directionTone} /></Field>
          <Field quiet label="Scenario" group>
            <Segmented value={(shown.plan_scenario ?? '') as Scenario} onChange={on('plan_scenario')} options={['A', 'B', 'none'] as const} labelFor={(v) => (v === 'none' ? 'Unplanned' : v)} accentFor={scenarioTone} />
          </Field>
          <Field quiet label="Leg location" group><Segmented value={(shown.leg_location ?? '') as LegLocation} onChange={on('leg_location')} options={LEG_LOCATIONS} accentFor={legTone(shown.direction)} /></Field>
          <Field quiet label="HTF origin" group><Segmented value={(shown.htf_origin ?? '') as HtfOrigin} onChange={on('htf_origin')} options={HTF_ORIGINS} compact /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field quiet label="Target type"><Select value={shown.target_type} onChange={on('target_type')} options={editing ? TARGET_VALUES : [trade.target_type]} labelFor={targetLabel} disabled={!editing} /></Field>
            <Field quiet label="Entry type"><Select value={shown.entry_method ?? null} onChange={on('entry_method')} options={editing ? ENTRY_VALUES : shown.entry_method ? [shown.entry_method] : []} placeholder="—" labelFor={entryLabel} disabled={!editing} /></Field>
          </div>
          <Field quiet label="Planned R" group><Segmented value={shown.planned_rr ?? ''} onChange={on('planned_rr')} options={V2_PLANNED_RS} labelFor={(v) => `${v}R`} accentFor={plannedRTone} /></Field>
          <Field quiet label="Confidence" group><Segmented value={shown.confidence_at_entry ? String(shown.confidence_at_entry) : ''} onChange={editing ? (v) => set('confidence_at_entry', Number(v)) : noop} options={CONFIDENCES} accentFor={confidenceTone} /></Field>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
        <div className={`${ro} flex flex-col gap-4`} aria-readonly={!editing}>
        <GateBar value={gapOf(shown.singular_gap)} onChange={editing ? (v) => set('singular_gap', v === 'one') : noop} readOnly={!editing} />
        <div className="grid gap-3 xl:grid-flow-col xl:grid-cols-2 xl:grid-rows-2">
          {ROWS.map((r) => (
            <RubricRow key={r.key} row={r} value={rowsOf(r.key)} focused={false} readOnly={!editing} onFocus={noop} onPick={editing ? (v) => set(r.key, v) : noop}
              late={(trade.late_rows ?? []).includes(r.key)} />
          ))}
        </div>
        </div>
        {/* The charts stay on Step 1: the ones saved, and room to add more — the decision above stays locked. */}
        <TradeCharts tradeId={trade.id} />
        </div>
      </div>
      <CloseDialog open={asking} onCancel={() => setAsking(false)}
        title="Edit Step 1 — once?"
        body={`The rows, the gate and the facts can be changed one time; the grade is given again from them. The decision (${DECISION_LABEL[decision].toLowerCase()}) and its time stay as they were. The original is kept beside the edit and the trade shows as edited.${trade.outcome_at ? ' The outcome is already written, so this trade will leave the Rubric v2 sample: a grade given knowing the result is not a grade before the outcome.' : ''}`}
        actions={[
          { label: 'Edit it', primary: true, data: 'edit', onClick: () => { setAsking(false); setEditing(true); } },
          { label: 'Keep it locked', data: 'keep', onClick: () => setAsking(false) },
        ]} />
    </div>
  );
}

/** Step 1's answers, as the edit line names them. */
const STEP1_LABEL: Record<Step1Key, string> = {
  row_sweep: 'Sweep', row_inversion: 'Inversion', row_path: 'Path', row_target: 'Target', singular_gap: 'Gap',
  leg_location: 'Leg', htf_origin: 'HTF origin', direction: 'Direction', plan_scenario: 'Scenario', planned_rr: 'Planned R',
  target_type: 'Target type', entry_method: 'Entry', confidence_at_entry: 'Confidence',
};
const fmt = (v: unknown) => (v == null ? '—' : v === true ? 'one gap' : v === false ? 'more than one' : String(v));
