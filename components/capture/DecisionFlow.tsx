'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { usePreferences } from '@/components/shell/PreferencesProvider';
import { Select } from '@/components/ui/Select';
import { Segmented } from '@/components/ui/Segmented';
import { Field, Input } from '@/components/ui/Field';
import { TagPicker } from '@/components/ui/TagPicker';
import { Help } from '@/components/ui/Help';
import { ShotSlots, type SlotFiles } from './ShotSlots';
import { ExplanationField } from './ExplanationField';
import { DrillChip, type DrillKept } from './DrillChip';
import { SimilarCard, type SimilarResult } from './SetupAnatomy';
import { SessionTally } from './SessionTally';
import { PathBanner } from '@/components/path/PathBanner';
import { TRADE_SAVED } from '@/components/review/SavedNotice';
import { closeCapture } from '@/lib/nav';
import { clearCarry, readCarry, writeCarry } from '@/lib/backtestSession';
import { press, spring, springSoft, riseIn } from '@/lib/motion';
import {
  BACKTEST, BACKTEST_REASON, INSTRUMENTS, MANAGEMENTS, MARKET_TAGS, MISTAKE_TAGS, SESSIONS, SHOT_SLOTS, WORKED_TAGS,
  accountLabel, tagOptions, type Account,
} from '@/lib/domain';
import { EXIT_REASONS } from '@/lib/anatomy';
import { REGRADE_HINT, regradeOptions, type GradeLetter } from '@/lib/grade';
import { MIN_EXPLANATION, MIN_LESSON, type Trade } from '@/lib/types';
import { playChime } from '@/lib/chime';
import {
  DECISION_LABEL, LEG_HELP, LEG_LOCATIONS, OVERRIDE_PROMPT, ROWS, RUBRIC_V2_LABEL, SCENARIO_LABEL,
  V2_ENTRIES, V2_LETTER_OF, V2_PLANNED_RS, V2_TARGETS, clock, consistencyFlags, gradeV2, lockDecision,
  needsOverride, rulesFollowedV2, scenarioFromPlan,
  type Decision, type LegLocation, type RowKey, type Scenario, type V2Grade,
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
  return (
    <motion.div {...riseIn} transition={springSoft} data-sheet data-decision-flow={saved ? view : 'decide'}
      // Fills the window below the title bar: the columns stretch to the bottom instead of stopping short.
      className="glass mx-auto flex flex-col rounded-[calc(28px*var(--rk))] p-5 sm:p-6 lg:min-h-[calc(100dvh-var(--titlebar-h,2.75rem)-2rem)]">
      {saved ? (
        <>
          {view === 'locked' && <LockedStep1 trade={saved} onForward={() => setView('outcome')} />}
          <div className={view === 'locked' ? 'hidden' : 'flex flex-1 flex-col'}>
            <OutcomeStep trade={saved} onNext={onNext} onBack={() => setView('locked')} />
          </div>
        </>
      ) : <DecideStep onSaved={setSaved} />}
    </motion.div>
  );
}

/* ═════════════════════════ Step 1 — Decide ═════════════════════════ */

function DecideStep({ onSaved }: { onSaved: (t: Trade) => void }) {
  const { prefs } = usePreferences();
  // The clock starts the moment the form opens.
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [carry] = useState(() => (typeof window === 'undefined' ? null : readCarry()));
  useEffect(() => { clearCarry(); }, []);

  const [account, setAccount] = useState<Account>(() => {
    const last = carry?.account ?? read(LAST_ACCOUNT_KEY);
    return (ACCOUNTS as readonly string[]).includes(last ?? '') ? last as Account : BACKTEST;
  });
  const backtest = account === BACKTEST;
  const [instrument, setInstrument] = useState(() => {
    const last = carry?.instrument ?? read(LAST_INSTRUMENT_KEY);
    return (INSTRUMENTS as readonly string[]).includes(last ?? '') ? last! : 'NQ';
  });
  // NY AM unless "Save & next" carried the replay's session over.
  const [session, setSession] = useState<string>(() => carry?.session ?? 'NY AM');
  const [direction, setDirection] = useState<'Long' | 'Short' | null>(null);
  const [picked, setPicked] = useState<Scenario | null>(null);
  const [leg, setLeg] = useState<LegLocation | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [entry, setEntry] = useState<string | null>(null);
  const [plannedR, setPlannedR] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [rows, setRows] = useState<Partial<Record<RowKey, 0 | 1 | 2>>>({});
  const [scoredAt, setScoredAt] = useState<Partial<Record<RowKey, number>>>({});
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
  const c = clock(startedAt, now, limit);
  const expired = timed && c.expired;

  // A tenth of a second is fine enough for a clock read in whole seconds.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, []);

  // Demo and Live: the morning plan's scenario for this direction, pre-selected. Backtests: always chosen by hand.
  const [plans, setPlans] = useState<{ aDir: string | null; bDir: string | null } | null>(null);
  useEffect(() => {
    if (backtest) return;
    const d = new Date(); const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    let live = true;
    void fetch(`/api/prep?day=${day}`).then((r) => (r.ok ? r.json() : null)).then((j: { prep: { data: { answers: Record<string, unknown> } } | null } | null) => {
      if (!live) return;
      const a = j?.prep?.data.answers;
      const s = (k: string) => (typeof a?.[k] === 'string' ? a[k] as string : null);
      setPlans(a ? { aDir: s('plans.aDir'), bDir: s('plans.bDir') } : null);
    }).catch(() => {});
    return () => { live = false; };
  }, [backtest]);
  // Chosen by hand wins; otherwise, off backtests, the morning plan's scenario for this direction.
  const scenario: Scenario | null = picked ?? (backtest ? null : scenarioFromPlan(direction, plans));
  const setScenario = (s: Scenario) => setPicked(s);

  const input = { ...rows, direction, plan_scenario: scenario, leg_location: leg, planned_rr: plannedR };
  const grade: V2Grade = gradeV2(input);
  const ready = grade.missing.length === 0 && direction != null && scenario != null;
  const owed = [
    ...grade.missing.map((k) => ROWS.find((r) => r.key === k)!.label),
    ...(direction ? [] : ['direction']), ...(scenario ? [] : ['scenario']),
  ];
  const optional = [leg ? null : 'leg location', target ? null : 'target', entry ? null : 'entry', plannedR ? null : 'planned R', confidence ? null : 'confidence'].filter(Boolean) as string[];

  const score = useCallback((key: RowKey, v: 0 | 1 | 2) => {
    setRows((r) => ({ ...r, [key]: v }));
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
      date: localNow(), undated: false, instrument, direction: direction ?? 'Long', session,
      macro_time: false, macro_time_auto: true, reason, setup_type: carry?.setupType ?? 'iFVG',
      htf_bias: scenario === 'A' ? 'With bias' : scenario === 'B' ? 'Against bias' : 'No bias defined',
      premium_discount: leg === 'EQ' || !leg ? 'Equilibrium' : leg,
      target_type: target ?? 'Other',
      ...rows, plan_scenario: scenario, leg_location: leg, planned_rr: plannedR, entry_method: entry,
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
  }, [startedAt, timed, limit, grade, scoredAt, backtest, instrument, direction, session, carry, scenario, leg, target, rows, plannedR, entry, confidence, account, slots, onSaved]);

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
  const touched = Object.keys(rows).length > 0 || direction != null || picked != null || leg != null || target != null
    || entry != null || plannedR != null || confidence != null || Object.values(slots).some(Boolean);
  const requestClose = useCallback(() => { if (touched) setClosing(true); else closeCapture(); }, [touched]);

  // Keyboard: 0/1/2 score the focused row and move on; ↑ ↓ move; L/S direction; A/B/U scenario; T take; P pass.
  // In the capture phase, before the app's own single-key shortcuts (which would navigate away mid-decision);
  // every other single key is swallowed while Step 1 is open, for the same reason.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA)$/.test(el.tagName))) return;
      if (document.querySelector('[role="listbox"]') || closing) return;
      const k = e.key.toLowerCase();
      const ours = asking ? ['enter', 't', 'escape'] : ['0', '1', '2', 'arrowdown', 'arrowup', 'l', 's', 'a', 'b', 'u', 't', 'p', 'm', 'escape'];
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
        setFocus((f) => Math.min(ROWS.length - 1, f + 1));
      } else if (k === 'arrowdown') { e.preventDefault(); setFocus((f) => Math.min(ROWS.length - 1, f + 1)); }
      else if (k === 'arrowup') { e.preventDefault(); setFocus((f) => Math.max(0, f - 1)); }
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
  }, [asking, focus, score, decide, save, expired, closing, requestClose]);

  return (
    <div data-decide-step className="flex flex-1 flex-col">
      {/* Header: the step, the clock and the grade, side by side; the Path and close on the right. */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[20px] font-semibold">New trade <span className="text-[13px] font-medium" style={faint}>· Step 1 of 2 — Decide</span></h1>
          <p className="mt-0.5 text-[12.5px]" style={dim}>
            Score the four rows at the candle close, then Take or Pass. <span className="hidden sm:inline" style={faint}>Keys: 0 1 2 · ↑ ↓ · L S · A B U · T P{expired ? ' · M missed' : ''}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Timer timed={timed} left={c.left} elapsed={c.elapsed} limit={limit} tone={c.tone} expired={expired} over={c.over} />
          <GradeChip grade={grade} />
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          {backtest && <SessionTally />}
          <PathBanner compact />
          <CloseButton onClick={requestClose} title="Close (Esc) — asks first if anything is entered" />
        </div>
      </div>

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
            <Segmented value={scenario ?? ('' as Scenario)} onChange={setScenario}
              options={['A', 'B', 'none'] as const} labelFor={(v) => (v === 'none' ? 'Unplanned' : v)} titleFor={(v) => SCENARIO_LABEL[v]} accentFor={scenarioTone} />
          </Field>
          <Field quiet label="Leg location" hint={LEG_HELP}>
            <Segmented value={leg ?? ('' as LegLocation)} onChange={setLeg} options={LEG_LOCATIONS} accentFor={legTone(direction)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field quiet label="Target type">
              <Select value={target} onChange={setTarget} placeholder="Which…" options={TARGET_VALUES} labelFor={targetLabel} />
            </Field>
            <Field quiet label="Entry type">
              <Select value={entry} onChange={setEntry} placeholder="How…" options={ENTRY_VALUES} labelFor={entryLabel} />
            </Field>
          </div>
          <Field quiet label="Planned R" hint="Under 1.5R is no trade.">
            <Segmented value={plannedR ?? ''} onChange={setPlannedR} options={V2_PLANNED_RS} labelFor={(v) => `${v}R`} accentFor={plannedRTone} />
          </Field>
          <Field quiet label="Confidence" hint="Before the outcome — it predicts better than the old checklist did.">
            <Segmented value={confidence ? String(confidence) : ''} onChange={(v) => setConfidence(Number(v))} options={CONFIDENCES} accentFor={confidenceTone} />
          </Field>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
        {/* The rubric: four rows, one tap each, each option's definition on it. Column by column, in key order. */}
        <div className="grid gap-3 xl:grid-flow-col xl:grid-cols-2 xl:grid-rows-2" data-rubric>
          {ROWS.map((r, i) => (
            <RubricRow key={r.key} row={r} value={rows[r.key] ?? null} focused={focus === i} flash={flashing && rows[r.key] == null}
              late={timed && scoredAt[r.key] != null && scoredAt[r.key]! > startedAt + limit * 1000}
              onFocus={() => setFocus(i)} onPick={(v) => { score(r.key, v); setFocus(Math.min(ROWS.length - 1, i + 1)); }} />
          ))}
        </div>

        {/* The chart (paste any time — the clock never stops) and the decision. */}
        <div className="flex min-h-0 flex-1 flex-col gap-3" data-decide>
          <div className="min-h-[14rem] flex-1"><ShotSlots files={slots} onChange={setSlots} grow /></div>
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
    <div onMouseDown={onFocus} data-row={row.key} data-focused={focused || undefined} data-score={value ?? ''}
      className={`rounded-[calc(16px*var(--rk))] border p-2.5 transition-colors ${flash ? 'need-flash' : ''}`}
      style={{ borderColor: focused ? 'rgb(var(--accent) / 0.55)' : 'var(--glass-stroke)', background: focused ? 'rgb(var(--accent) / 0.05)' : 'var(--glass-fill)' }}>
      <div className="mb-1.5 flex items-center justify-between px-1">
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
  const [market, setMarket] = useState<string[]>(trade.market_tags ?? []);
  const [worked, setWorked] = useState<string[]>(trade.worked_tags ?? []);
  const [regrade, setRegrade] = useState(trade.regrade ?? null);
  const [drillKey, setDrillKey] = useState<string | null>(trade.drill_key ?? null);
  const [drillKept, setDrillKept] = useState<DrillKept | null>(trade.drill_kept ?? null);
  const [stage, setStage] = useState<'Live' | 'Settled'>(trade.status === 'Live' && !trade.outcome_at ? 'Settled' : (trade.status === 'Live' ? 'Live' : 'Settled'));
  const [slots, setSlots] = useState<SlotFiles>({});
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
  const owed = [
    ...(taken && settled && !ended ? ['how it ended'] : []),
    ...(taken && settled && num(r) == null ? ['R'] : []),
    ...(!taken && num(wouldR) == null ? ['what it would have done'] : []),
    ...(explanation.trim().length < MIN_EXPLANATION ? [`explanation (${MIN_EXPLANATION}+)`] : []),
    ...(settled && lesson.trim().length < MIN_LESSON ? [`lesson (${MIN_LESSON}+)`] : []),
  ];

  // What has been written since the form opened: closing then asks.
  const snapshot = JSON.stringify([ended, r, pnl, contracts, mfe, reached1R, exit, management, wouldR, wouldMfe, explanation, lesson, me, market, worked, regrade, stage, drillKept, Object.values(slots).filter(Boolean).length]);
  const [initial] = useState(snapshot);
  const dirty = snapshot !== initial;
  const requestClose = useCallback(() => { if (dirty) setClosing(true); else closeCapture(); }, [dirty]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || closing || document.querySelector('[role="listbox"]')) return;
      e.preventDefault(); e.stopPropagation(); requestClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [closing, requestClose]);

  // The trade as written so far, for a drill measured from the fields.
  const draft: Partial<Trade> = {
    ...trade, exit_reason: taken ? exit : null, mfe_r: taken ? num(mfe) : null, would_be_r: taken ? null : num(wouldR),
  };
  const onDrill = useCallback((k: string | null, v: DrillKept | null) => { setDrillKey(k); setDrillKept(v); }, []);

  /** `draft`: keep what is written but leave the outcome unwritten — the trade stays on the Unfinished shelf. */
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
      mistake_tags: me, market_tags: market, worked_tags: worked,
      regrade, drill_key: drillKey, drill_kept: drillKey ? drillKept : null,
      // Step 2 is written once settled; a trade still open stays pending.
      outcome_at: draft ? (trade.outcome_at ?? null) : settled ? (trade.outcome_at ?? new Date().toISOString()) : null,
    };
    const body = new FormData();
    const firstShot = SHOT_SLOTS.find((s) => slots[s]) ?? null;
    // The trade's first chart, when Step 1 had none; any other goes beside it.
    if (firstShot && !trade.screenshot_path) body.append('screenshot', slots[firstShot]!);
    body.append('trade', JSON.stringify(payload));
    try {
      const res = await fetch(`/api/trades/${trade.id}`, { method: 'PUT', body });
      const text = await res.text();
      if (!res.ok) { let msg = text.slice(0, 300); try { msg = JSON.parse(text).error ?? msg; } catch { /* raw */ } throw new Error(msg); }
      for (const s of SHOT_SLOTS) {
        if (!slots[s] || (s === firstShot && !trade.screenshot_path)) continue;
        const f = new FormData(); f.append('screenshot', slots[s]!); f.append('slot', s);
        await fetch(`/api/trades/${trade.id}/shots`, { method: 'POST', body: f }).catch(() => {});
      }
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
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[20px] font-semibold">{first ? 'New trade' : 'Edit trade'} <span className="text-[13px] font-medium" style={faint}>· Step 2 of 2 — Outcome</span></h1>
          <p className="mt-0.5 text-[12.5px]" style={dim}>
            Saved at the decision. Write the outcome now or later — until then it counts nowhere.
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          {backtest && <SessionTally />}
          <PathBanner compact />
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
          <CloseButton onClick={requestClose} title="Close (Esc) — asks first if anything was written" />
        </div>
      </div>

      {/* Three equal columns: the locked decision, how it ended, the words. The tags run below them, then Save. */}
      <div className="grid flex-1 items-stretch gap-x-6 gap-y-5 lg:grid-cols-2 xl:grid-cols-3">
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
              {trade.direction} · {trade.plan_scenario ? SCENARIO_LABEL[trade.plan_scenario] : 'no scenario'} · leg {trade.leg_location ?? '—'} · target {trade.target_type} · {trade.entry_method ?? 'entry —'} · plan {trade.planned_rr ? `${trade.planned_rr}R` : '—'} · confidence {trade.confidence_at_entry ?? '—'}
            </p>
          </div>
          <Field quiet label="Honest re-grade" hint={`${REGRADE_HINT} Stored, never counted in stats or expectancy.`}>
            <Select value={regrade} onChange={setRegrade} placeholder="Not re-graded" options={regrades} />
          </Field>
          <SimilarCard s={similar} loading={simLoading} />
          <DrillChip drillKey={drillKey} value={drillKept} onChange={onDrill} draft={draft} />
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
                  <Segmented value={ended ?? ('' as Ended)} onChange={setEnded} options={ENDED} accentFor={endedTone} />
                </Field>
              )}
              <div className="grid grid-cols-3 gap-3">
                <Field quiet label="R" required={settled && num(r) == null} className={flashing && settled && num(r) == null ? 'need-flash' : ''}><Input inputMode="decimal" value={r} onChange={(e) => setR(e.target.value)} placeholder="e.g. 2 or −1" data-field="r" /></Field>
                <Field quiet label="P&L $"><Input inputMode="decimal" value={pnl} onChange={(e) => setPnl(e.target.value)} placeholder="—" /></Field>
                <Field quiet label="Contracts"><Input inputMode="numeric" value={contracts} onChange={(e) => setContracts(e.target.value)} placeholder="—" /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field quiet label="Max R (MFE)"><Input inputMode="decimal" value={mfe} onChange={(e) => setMfe(e.target.value)} placeholder="—" /></Field>
                <Field quiet label="Reached +1R before the stop">
                  <Segmented value={reached1R == null ? '' : reached1R ? 'Yes' : 'No'} onChange={(v) => setReached1R(v === 'Yes')} options={['Yes', 'No']} accentFor={yesNoTone} compact />
                </Field>
              </div>
              <Field quiet label="Exit">
                <Segmented value={exit ?? ''} onChange={setExit} options={EXIT_REASONS} accentFor={exitTone} compact />
              </Field>
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
          <div className="flex min-h-0 flex-1 flex-col">
            <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={faint}>Charts · entry and result</span>
            <div className="min-h-0 flex-1"><ShotSlots files={slots} onChange={setSlots} grow /></div>
            {trade.screenshot_path && <p className="mt-1 text-[10.5px]" style={faint}>A chart from Step 1 is on the trade; paste more and they join it.</p>}
          </div>
        </div>

        {/* The words, and what they add up to. */}
        <div className="flex flex-col gap-3 lg:col-span-2 xl:col-span-1" data-words>
          <Field quiet label="Explanation" required={explanation.trim().length < MIN_EXPLANATION} className={flashing && explanation.trim().length < MIN_EXPLANATION ? 'need-flash' : ''}><ExplanationField value={explanation} onChange={setExplanation} placeholder="What you saw and why you decided as you did." minRows={4} /></Field>
          <Field quiet label="Lesson" required={settled && lesson.trim().length < MIN_LESSON} className={flashing && settled && lesson.trim().length < MIN_LESSON ? 'need-flash' : ''}><ExplanationField value={lesson} onChange={setLesson} placeholder="What would you do differently?" minChars={MIN_LESSON} minRows={3} required={settled} /></Field>
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
        </div>
      </div>

      {/* The three tag lists, side by side under a rule — the same three columns as above. */}
      <div className="mt-5 grid gap-x-6 gap-y-4 border-t pt-4 md:grid-cols-3" style={{ borderColor: 'var(--glass-stroke)' }} data-tags>
        <TagBlock title="What went wrong — me" help="Execution and management only. Each one is a rule broken.">
          <TagPicker small value={me} onChange={setMe} options={tagOptions(MISTAKE_TAGS, trade.mistake_tags)} tone="loss" />
        </TagBlock>
        <TagBlock title="What went wrong — market" help="Outside your control. Never a rule broken.">
          <TagPicker small value={market} onChange={setMarket} options={tagOptions(MARKET_TAGS as readonly string[], trade.market_tags)} tone="market" />
        </TagBlock>
        <TagBlock title="What worked">
          <TagPicker small value={worked} onChange={setWorked} options={tagOptions(WORKED_TAGS as readonly string[], trade.worked_tags)} tone="win" />
        </TagBlock>
      </div>

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

function TagBlock({ title, help, children }: { title: string; help?: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="mb-1 flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={faint}>
        {title}{help && <Help>{help}</Help>}
      </span>
      {children}
    </div>
  );
}


/* ═════════════════════════ closing ═════════════════════════ */

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

const noop = () => {};

/**
 * Step 1 as it was locked, from Step 2's "← Step 1": the same layout, every
 * answer shown, nothing changeable — the decision is the record of that
 * moment. "Step 2 →" goes back to what you were writing.
 */
function LockedStep1({ trade, onForward }: { trade: Trade; onForward: () => void }) {
  const g = gradeV2(trade);
  const letter = V2_LETTER_OF(trade.grade_letter) ?? 'No trade';
  const decision = (trade.decision ?? 'take') as Decision;
  const rowsOf = (k: RowKey) => (trade[k] ?? null) as 0 | 1 | 2 | null;
  return (
    <div data-locked-step1 className="flex flex-1 flex-col">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[20px] font-semibold">New trade <span className="text-[13px] font-medium" style={faint}>· Step 1 of 2 — Decide · locked</span></h1>
          <p className="mt-0.5 text-[12.5px]" style={dim}>
            {DECISION_LABEL[decision]} in {trade.decision_seconds ?? '—'}s{trade.decision_limit ? ` of ${trade.decision_limit}s` : ' (untimed)'}
            {trade.decided_at && <> · {new Date(trade.decided_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</>}
            {' '}· nothing here can change.
          </p>
        </div>
        <div className="rounded-[calc(16px*var(--rk))] border px-3 py-2" style={{ borderColor: `color-mix(in srgb, ${LETTER_TONE[letter]} 45%, transparent)`, background: `color-mix(in srgb, ${LETTER_TONE[letter]} 9%, transparent)` }}>
          <span className="text-[24px] font-semibold leading-none" style={{ color: LETTER_TONE[letter] }}>{letter}</span>
          <span className="ml-2 text-[12px] tabular-nums" style={faint}>{g.total}/8 · v2</span>
          {(g.gate || g.caps.length > 0 || g.lowR) && <p className="mt-0.5 max-w-[16rem] text-[10.5px]" style={dim}>{g.reason}</p>}
        </div>
        <motion.button type="button" onClick={onForward} whileTap={press} transition={spring} data-forward
          className="rounded-full px-4 py-1.5 text-[12.5px] font-semibold" style={{ background: 'rgb(var(--accent))', color: 'var(--bg-raised)' }}>
          Step 2 →
        </motion.button>
      </div>

      <div className="pointer-events-none grid flex-1 items-start gap-x-6 gap-y-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.2fr)]" aria-readonly>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field quiet label="Account"><Select value={trade.account} onChange={noop} options={[trade.account]} labelFor={(a) => accountLabel(a as Account)} disabled /></Field>
            <Field quiet label="Instrument"><Select value={trade.instrument} onChange={noop} options={[trade.instrument]} disabled /></Field>
          </div>
          <Field quiet label="Session"><Select value={trade.session} onChange={noop} options={[trade.session]} disabled /></Field>
          <Field quiet label="Direction" group><Segmented value={trade.direction} onChange={noop} options={['Long', 'Short'] as const} accentFor={directionTone} /></Field>
          <Field quiet label="Scenario" group>
            <Segmented value={(trade.plan_scenario ?? '') as Scenario} onChange={noop} options={['A', 'B', 'none'] as const} labelFor={(v) => (v === 'none' ? 'Unplanned' : v)} accentFor={scenarioTone} />
          </Field>
          <Field quiet label="Leg location" group><Segmented value={(trade.leg_location ?? '') as LegLocation} onChange={noop} options={LEG_LOCATIONS} accentFor={legTone(trade.direction)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field quiet label="Target type"><Select value={trade.target_type} onChange={noop} options={[trade.target_type]} labelFor={targetLabel} disabled /></Field>
            <Field quiet label="Entry type"><Select value={trade.entry_method ?? null} onChange={noop} options={trade.entry_method ? [trade.entry_method] : []} placeholder="—" labelFor={entryLabel} disabled /></Field>
          </div>
          <Field quiet label="Planned R" group><Segmented value={trade.planned_rr ?? ''} onChange={noop} options={V2_PLANNED_RS} labelFor={(v) => `${v}R`} accentFor={plannedRTone} /></Field>
          <Field quiet label="Confidence" group><Segmented value={trade.confidence_at_entry ? String(trade.confidence_at_entry) : ''} onChange={noop} options={CONFIDENCES} accentFor={confidenceTone} /></Field>
        </div>
        <div className="grid gap-3 xl:grid-flow-col xl:grid-cols-2 xl:grid-rows-2">
          {ROWS.map((r) => (
            <RubricRow key={r.key} row={r} value={rowsOf(r.key)} focused={false} readOnly onFocus={noop} onPick={noop}
              late={(trade.late_rows ?? []).includes(r.key)} />
          ))}
        </div>
      </div>
    </div>
  );
}
