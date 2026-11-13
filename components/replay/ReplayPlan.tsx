'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Overlay } from '@/components/ui/Overlay';
import { Help } from '@/components/ui/Help';
import { press, spring } from '@/lib/motion';
import {
  CONFIRMS, DAY_OUTCOMES, DAY_OUTCOME_LABEL, H4, KILLS, MAX_ZONES, NEWS, OPEN_LOCATIONS, OVERNIGHT, RR_BANDS, SCENARIO_C, TOOK, TOOK_LABEL,
  copyPlan, dayBias, emptyContext, emptyScenarios, lockMissing, nextWeekday, noBiasCap, playedOf, rrWarning, scenarioLine, targetOptions,
  tookFromTrades, weekdayOf, withDirections, zoneOptions,
  type DayOutcome, type ReplayContext, type ReplayDay, type ReplayScenario, type ReplayScenarios, type Took,
} from '@/lib/replay';

/*
  Replay plans (048), the backtest twin of the morning check-in: a plan for
  each replay day built from taps only, locked before the first trade.
*/

export const REPLAY_CHANGED = 'signature:replay-changed';
export interface ReplayState { active: ReplayDay | null; last: ReplayDay | null; trades: Array<{ id: string; plan_scenario: string | null; decision: string | null; r: number | null }> }

/** The replay day being traded, the last one, and the active day's trades; refreshed on every change. */
export function useReplay(enabled = true): { state: ReplayState | null; reload: () => void } {
  const [state, setState] = useState<ReplayState | null>(null);
  const reload = useCallback(() => {
    void fetch('/api/replay').then((r) => (r.ok ? r.json() : null)).then(setState).catch(() => {});
  }, []);
  useEffect(() => {
    if (!enabled) return;
    reload();
    window.addEventListener(REPLAY_CHANGED, reload);
    return () => window.removeEventListener(REPLAY_CHANGED, reload);
  }, [enabled, reload]);
  return { state, reload };
}
const changed = () => window.dispatchEvent(new CustomEvent(REPLAY_CHANGED));
const faint = { color: 'var(--text-faint)' } as const;
const dim = { color: 'var(--text-dim)' } as const;
const fmtDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const today = () => { const d = new Date(); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

/* ───────────────────────── a group of chips ───────────────────────── */

function Chips<T extends string>({ id, label, options, value, onChange, multi = false, max, focused, onFocus, labelFor, tone, hint, required }: {
  id: string; label: string; options: readonly T[]; value: T | T[] | null; onChange: (v: T | T[] | null) => void;
  multi?: boolean; max?: number; focused: boolean; onFocus: () => void; labelFor?: (v: T) => string;
  tone?: (v: T) => string | undefined; hint?: string; required?: boolean;
}) {
  const picked = multi ? (value as T[] | null) ?? [] : value != null ? [value as T] : [];
  const tap = (o: T) => {
    if (!multi) { onChange(value === o ? null : o); return; }
    const list = picked.includes(o) ? picked.filter((x) => x !== o) : max && picked.length >= max ? [...picked.slice(1), o] : [...picked, o];
    onChange(list);
  };
  return (
    <div data-replay-group={id} onMouseDown={onFocus} className="rounded-[12px] px-2 py-1.5 transition-colors"
      style={{ boxShadow: focused ? '0 0 0 1px rgb(var(--accent) / 0.45)' : undefined }}>
      <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.07em]" style={{ color: required && !picked.length ? 'rgb(var(--accent))' : 'var(--text-faint)' }}>
        {required && !picked.length && <span aria-hidden className="size-1.5 rounded-full" style={{ background: 'rgb(var(--accent))' }} />}
        {label}{multi && <span className="normal-case tracking-normal opacity-70">· {max ? `up to ${max}` : 'any'}</span>}
        {hint && <Help>{hint}</Help>}
      </div>
      <div className="flex flex-wrap gap-1">
        {options.map((o, i) => {
          const on = picked.includes(o);
          const t = tone?.(o) ?? 'var(--accent)';
          return (
            <button key={o} type="button" onClick={() => tap(o)} aria-pressed={on} data-chip={o}
              className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] transition-colors"
              style={{ borderColor: on ? `rgb(${t} / 0.6)` : 'var(--glass-stroke)', background: on ? `rgb(${t} / 0.13)` : 'transparent', color: on ? `rgb(${t})` : 'var(--text-dim)' }}>
              {/* The key hint always takes its space (shown only in the lit group): lighting a group must not move a chip under the pointer. */}
              {i < 9 && <span className="text-[9.5px] tabular-nums" style={{ opacity: focused ? 0.6 : 0 }} aria-hidden>{i + 1}</span>}
              {labelFor ? labelFor(o) : o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const WIN = 'var(--outcome-win)';
const LOSS = 'var(--outcome-loss)';
const dirTone = (d: string) => (d === 'Long' ? WIN : LOSS);

/* ───────────────────────── the builder ───────────────────────── */

/**
 * "Plan replay day": one screen of chips. Number keys pick inside the
 * focused group, Tab and the arrows move between groups, Enter locks.
 * With `amend`, the same screen edits a locked day — saved beside the
 * original, and the day is flagged amended.
 */
type BuilderProps = { open: boolean; onClose: () => void; last: ReplayDay | null; amend?: ReplayDay | null; instrument?: string | null; onLocked?: (d: ReplayDay) => void };
export function ReplayBuilder(props: BuilderProps) {
  return (
    <Overlay open={props.open} onClose={props.onClose} className="w-full max-w-[72rem] rounded-[24px] p-5" surface="color-mix(in srgb, var(--bg-raised) 96%, transparent)">
      {/* Mounted fresh on every opening: it starts from the next date and an empty (or the amended) plan. */}
      {props.open && <BuilderBody {...props} />}
    </Overlay>
  );
}

function BuilderBody({ open, onClose, last, amend, instrument, onLocked }: BuilderProps) {
  const start = amend ? copyPlan({ context: amend.amended_context ?? amend.context, scenarios: amend.amended_scenarios ?? amend.scenarios }) : null;
  const [date, setDate] = useState(() => (amend ? amend.replay_date : last ? nextWeekday(last.replay_date) : today()));
  const [context, setContext] = useState<ReplayContext>(() => start?.context ?? emptyContext());
  const [raw, setRaw] = useState<ReplayScenarios>(() => start?.scenarios ?? emptyScenarios());
  const [focus, setFocus] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const s = withDirections(context, raw);
  const bias = dayBias(context);
  const missing = lockMissing(context, raw);
  const setA = (p: Partial<ReplayScenario>) => setRaw((r) => ({ ...r, a: { ...r.a, ...p } }));
  const setB = (p: Partial<ReplayScenario>) => setRaw((r) => ({ ...r, b: { ...r.b, ...p } }));
  const setC = (p: Partial<ReplayContext>) => setContext((c) => ({ ...c, ...p }));

  // The groups in order, for the keyboard: each one's options and how to pick by index.
  type G = { id: string; options: readonly string[]; pick: (o: string) => void };
  const groups: G[] = useMemo(() => {
    const scen = (k: 'a' | 'b', sc: ReplayScenario, set: (p: Partial<ReplayScenario>) => void): G[] => [
      ...(k === 'a' && !bias ? [{ id: 'a-dir', options: ['Long', 'Short'], pick: (o: string) => set({ dir: sc.dir === o ? null : o as 'Long' }) }] : []),
      { id: `${k}-zones`, options: zoneOptions(sc.dir, context.news), pick: (o) => set({ zones: sc.zones.includes(o) ? sc.zones.filter((z) => z !== o) : [...sc.zones, o].slice(-MAX_ZONES) }) },
      { id: `${k}-confirm`, options: CONFIRMS, pick: (o) => set({ confirm: sc.confirm.includes(o) ? sc.confirm.filter((z) => z !== o) : [...sc.confirm, o] }) },
      { id: `${k}-target`, options: targetOptions(context.news), pick: (o) => set({ target: sc.target === o ? null : o }) },
      { id: `${k}-rr`, options: RR_BANDS, pick: (o) => set({ rr: sc.rr === o ? null : o as ReplayScenario['rr'] }) },
      { id: `${k}-kill`, options: KILLS, pick: (o) => set({ kill: sc.kill === o ? null : o as ReplayScenario['kill'] }) },
    ];
    return [
      { id: 'h4', options: H4, pick: (o) => setC({ h4: context.h4 === o ? null : o as ReplayContext['h4'], ...(o === 'None' ? { h1Agrees: null } : {}) }) },
      ...(context.h4 && context.h4 !== 'None' ? [{ id: 'h1', options: ['Yes', 'No'], pick: (o: string) => setC({ h1Agrees: o === 'Yes' }) }] : []),
      { id: 'overnight', options: OVERNIGHT, pick: (o) => setC({ overnight: context.overnight === o ? null : o as ReplayContext['overnight'] }) },
      { id: 'news', options: NEWS, pick: (o) => setC({ news: context.news === o ? null : o as ReplayContext['news'] }) },
      { id: 'open', options: OPEN_LOCATIONS, pick: (o) => setC({ open: context.open === o ? null : o as ReplayContext['open'] }) },
      ...scen('a', s.a, setA), ...scen('b', s.b, setB),
    ];
  }, [context, s, bias]);
  const fid = groups[Math.min(focus, groups.length - 1)]?.id;
  const focusOn = (id: string) => setFocus(Math.max(0, groups.findIndex((g) => g.id === id)));

  const lock = useCallback(async () => {
    if (missing.length) { setError(`Still to tap: ${missing.join(', ')}.`); return; }
    setSaving(true); setError(null);
    const res = await fetch('/api/replay', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(amend ? { action: 'amend', id: amend.id, context, scenarios: s } : { action: 'lock', replay_date: date, instrument: instrument ?? last?.instrument ?? 'NQ', context, scenarios: s }),
    }).catch(() => null);
    const body = res ? await res.json().catch(() => null) : null;
    setSaving(false);
    if (!res || !res.ok) { setError(body?.error ?? 'Could not save the plan.'); return; }
    changed();
    onLocked?.(body as ReplayDay);
    onClose();
  }, [missing, amend, context, s, date, instrument, last, onLocked, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA)$/.test(el.tagName)) return;
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); void lock(); return; }
      if (e.key === 'Tab' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); e.stopPropagation();
        const back = e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey);
        setFocus((f) => (f + (back ? -1 : 1) + groups.length) % groups.length);
        return;
      }
      if (/^[1-9]$/.test(e.key)) {
        const g = groups[Math.min(focus, groups.length - 1)];
        const o = g?.options[Number(e.key) - 1];
        if (o) { e.preventDefault(); e.stopPropagation(); g.pick(o); }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, groups, focus, lock]);

  const scenarioCol = (k: 'a' | 'b', sc: ReplayScenario, set: (p: Partial<ReplayScenario>) => void) => {
    const warn = rrWarning(sc.rr);
    return (
      <div className="rounded-[16px] border p-2" style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }} data-replay-scenario={k}>
        <div className="mb-1 flex items-baseline justify-between px-2">
          <span className="text-[13px] font-semibold">Scenario {k.toUpperCase()}</span>
          <span className="text-[11.5px]" style={{ color: sc.dir ? `rgb(${dirTone(sc.dir)})` : 'var(--text-faint)' }}>
            {sc.dir ?? 'direction —'}{k === 'a' ? (bias ? ' · with the bias' : ' · no bias: tap it') : ' · the other way'}{!bias && ' · max B'}
          </span>
        </div>
        {k === 'a' && !bias && (
          <Chips id="a-dir" label="Direction" options={['Long', 'Short'] as const} value={sc.dir} onChange={(v) => set({ dir: v as 'Long' | null })}
            focused={fid === 'a-dir'} onFocus={() => focusOn('a-dir')} tone={dirTone} required />
        )}
        <Chips id={`${k}-zones`} label="Trigger zone" options={zoneOptions(sc.dir, context.news)} value={sc.zones} multi max={MAX_ZONES}
          onChange={(v) => set({ zones: v as string[] })} focused={fid === `${k}-zones`} onFocus={() => focusOn(`${k}-zones`)} required
          hint="The high side for a short, the low side for a long. The data wick appears on a news day." />
        <Chips id={`${k}-confirm`} label="Confirmation" options={CONFIRMS} value={sc.confirm} multi onChange={(v) => set({ confirm: v as string[] })}
          focused={fid === `${k}-confirm`} onFocus={() => focusOn(`${k}-confirm`)} required />
        <Chips id={`${k}-target`} label="First target" options={targetOptions(context.news)} value={sc.target} onChange={(v) => set({ target: v as string | null })}
          focused={fid === `${k}-target`} onFocus={() => focusOn(`${k}-target`)} required />
        <Chips id={`${k}-rr`} label="Rough R" options={RR_BANDS} value={sc.rr} onChange={(v) => set({ rr: v as ReplayScenario['rr'] })}
          focused={fid === `${k}-rr`} onFocus={() => focusOn(`${k}-rr`)} tone={(o) => (o === '<1.5' ? LOSS : undefined)} required />
        {warn && <p className="px-2 pb-1 text-[11.5px] font-medium" style={{ color: `rgb(${LOSS})` }} data-rr-warning>{warn}</p>}
        <Chips id={`${k}-kill`} label="Kill switch" options={KILLS} value={sc.kill} onChange={(v) => set({ kill: v as ReplayScenario['kill'] })}
          focused={fid === `${k}-kill`} onFocus={() => focusOn(`${k}-kill`)} required />
      </div>
    );
  };

  return (
      <div data-replay-builder={amend ? 'amend' : 'plan'}>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[18px] font-semibold">{amend ? `Amend Day ${amend.sequence}` : 'Plan replay day'}</h2>
            <p className="text-[12px]" style={dim}>
              {amend ? 'The locked plan stays as it was; this is kept beside it, and the day shows as amended everywhere.'
                : 'Taps only. Keys: 1–9 pick in the lit group · Tab / ↑ ↓ move · Enter locks.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-[12px]" style={dim}>
              Replay date
              <input type="date" value={date} disabled={!!amend} onChange={(e) => setDate(e.target.value)} data-replay-date
                className="rounded-full border px-3 py-1 text-[12.5px]" style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)', color: 'var(--text)' }} />
              <span className="tabular-nums" style={faint}>{date ? weekdayOf(date) ?? 'weekend' : ''}</span>
            </label>
            {!amend && last && (
              <button type="button" onClick={() => { const p = copyPlan(last); setContext(p.context); setRaw(p.scenarios); }} data-copy-last
                className="rounded-full border px-3 py-1 text-[12px]" style={{ borderColor: 'var(--glass-stroke)', color: 'var(--text-dim)' }}>Copy last day</button>
            )}
          </div>
        </div>

        {/* Context. */}
        <div className="grid gap-1 rounded-[16px] border p-2 md:grid-cols-3" style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }}>
          <Chips id="h4" label="4H direction" options={H4} value={context.h4} onChange={(v) => setC({ h4: v as ReplayContext['h4'], ...(v === 'None' ? { h1Agrees: null } : {}) })}
            focused={fid === 'h4'} onFocus={() => focusOn('h4')} tone={(o) => (o === 'Bull' ? WIN : o === 'Bear' ? LOSS : undefined)} required />
          {context.h4 && context.h4 !== 'None' ? (
            <Chips id="h1" label="1H agrees with 4H" options={['Yes', 'No'] as const} value={context.h1Agrees == null ? null : context.h1Agrees ? 'Yes' : 'No'}
              onChange={(v) => setC({ h1Agrees: v == null ? null : v === 'Yes' })} focused={fid === 'h1'} onFocus={() => focusOn('h1')} required />
          ) : <div />}
          <div className="px-2 py-1.5" data-day-bias={bias ?? 'none'}>
            <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.07em]" style={faint}>Day bias · derived</div>
            <span className="inline-block rounded-full px-2.5 py-1 text-[12px] font-semibold"
              style={{ background: bias ? `rgb(${dirTone(bias)} / 0.13)` : 'var(--glass-fill-strong)', color: bias ? `rgb(${dirTone(bias)})` : 'var(--text-dim)' }}>
              {bias ?? 'No bias — both scenarios max B'}
            </span>
          </div>
          <Chips id="overnight" label="Overnight" options={OVERNIGHT} value={context.overnight} onChange={(v) => setC({ overnight: v as ReplayContext['overnight'] })}
            focused={fid === 'overnight'} onFocus={() => focusOn('overnight')} required />
          <Chips id="news" label="News" options={NEWS} value={context.news} onChange={(v) => setC({ news: v as ReplayContext['news'] })}
            focused={fid === 'news'} onFocus={() => focusOn('news')} required hint="On a news day the data wick becomes a trigger zone and a target." />
          <Chips id="open" label="Open location" options={OPEN_LOCATIONS} value={context.open} onChange={(v) => setC({ open: v as ReplayContext['open'] })}
            focused={fid === 'open'} onFocus={() => focusOn('open')} required />
        </div>

        {/* A, B and C. */}
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {scenarioCol('a', s.a, setA)}
          {scenarioCol('b', s.b, setB)}
        </div>
        <p className="mt-2 rounded-[12px] px-3 py-2 text-[12px]" style={{ background: 'var(--glass-fill)', color: 'var(--text-dim)' }}>
          <b style={{ color: 'var(--text)' }}>Scenario C</b> — {SCENARIO_C}
        </p>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 text-[11.5px]" style={error ? { color: `rgb(${LOSS})` } : faint} role={error ? 'alert' : undefined}>
            {error ?? (missing.length ? `Still to tap: ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? `, +${missing.length - 6}` : ''}.` : 'Ready to lock.')}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-full border px-4 py-2 text-[12.5px]" style={{ borderColor: 'var(--glass-stroke)', color: 'var(--text-dim)' }}>Cancel</button>
            <motion.button type="button" onClick={() => void lock()} disabled={saving} whileTap={press} transition={spring} data-lock-play
              className="rounded-full px-5 py-2 text-[13px] font-semibold disabled:opacity-50" style={{ background: 'rgb(var(--accent))', color: 'var(--bg-raised)' }}>
              {amend ? 'Save amendment' : 'Lock & play'} <span className="opacity-70">↵</span>
            </motion.button>
          </div>
        </div>
      </div>
  );
}

/* ───────────────────────── closing a day ───────────────────────── */

/** "Next replay day" or ending the sitting: what played out, and — for A or B — whether it was taken. */
type CloseProps = { open: boolean; onClose: () => void; day: ReplayDay | null; trades: ReplayState['trades']; onClosed: (planNext: boolean) => void };
export function CloseDayDialog(props: CloseProps) {
  return (
    <Overlay open={props.open} onClose={props.onClose} className="w-full max-w-[34rem] rounded-[22px] p-5" surface="color-mix(in srgb, var(--bg-raised) 96%, transparent)">
      {props.open && props.day && <CloseDayBody {...props} day={props.day} />}
    </Overlay>
  );
}
function CloseDayBody({ day, trades, onClosed }: CloseProps & { day: ReplayDay }) {
  const [outcome, setOutcome] = useState<DayOutcome | null>(null);
  // "Did I take it?" starts from the day's trades linked to each scenario.
  const [took, setTook] = useState<{ A: Took | null; B: Took | null }>(() => ({ A: tookFromTrades(trades, 'A'), B: tookFromTrades(trades, 'B') }));
  const [error, setError] = useState<string | null>(null);
  const played = playedOf(outcome);
  const save = async (planNext: boolean) => {
    if (!outcome) { setError('What played out today?'); return; }
    const res = await fetch('/api/replay', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'close', id: day.id, outcome, took_a: played.includes('A') ? took.A : null, took_b: played.includes('B') ? took.B : null, ends_sitting: !planNext }) }).catch(() => null);
    if (!res || !res.ok) { setError('Could not close the day.'); return; }
    changed();
    onClosed(planNext);
  };
  return (
      <div data-close-day>
        <h2 className="text-[16px] font-semibold">Day {day.sequence} · {day.weekday ?? ''} {fmtDate(day.replay_date)}: what played out?</h2>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {DAY_OUTCOMES.map((o) => (
            <button key={o} type="button" onClick={() => setOutcome(o)} aria-pressed={outcome === o} data-day-outcome={o}
              className="rounded-full border px-3 py-1.5 text-[12.5px]"
              style={outcome === o ? { borderColor: 'rgb(var(--accent))', background: 'rgb(var(--accent) / 0.12)', color: 'rgb(var(--accent))' } : { borderColor: 'var(--glass-stroke)', color: 'var(--text-dim)' }}>
              {DAY_OUTCOME_LABEL[o]}
            </button>
          ))}
        </div>
        {played.map((k) => (
          <div key={k} className="mt-3">
            <div className="mb-1 text-[11.5px]" style={dim}>Scenario {k} played — did I take it? {tookFromTrades(trades, k) && <span style={faint}>(from the day’s trades)</span>}</div>
            <div className="flex gap-1.5">
              {TOOK.map((t) => (
                <button key={t} type="button" onClick={() => setTook((x) => ({ ...x, [k]: t }))} aria-pressed={took[k] === t} data-took={`${k}:${t}`}
                  className="rounded-full border px-3 py-1 text-[12px]"
                  style={took[k] === t ? { borderColor: 'rgb(var(--accent))', background: 'rgb(var(--accent) / 0.12)', color: 'rgb(var(--accent))' } : { borderColor: 'var(--glass-stroke)', color: 'var(--text-dim)' }}>
                  {TOOK_LABEL[t]}
                </button>
              ))}
            </div>
          </div>
        ))}
        {error && <p className="mt-2 text-[12px]" style={{ color: `rgb(${LOSS})` }} role="alert">{error}</p>}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => void save(false)} data-end-sitting className="rounded-full border px-4 py-2 text-[12.5px]" style={{ borderColor: 'var(--glass-stroke)', color: 'var(--text-dim)' }}>
            Close & end the sitting
          </button>
          <button type="button" onClick={() => void save(true)} data-next-day className="rounded-full px-4 py-2 text-[12.5px] font-semibold" style={{ background: 'rgb(var(--accent))', color: 'var(--bg-raised)' }}>
            Close & plan the next day
          </button>
        </div>
      </div>
  );
}

/* ───────────────────────── the control ───────────────────────── */

/**
 * "Plan replay day" when none is active; "Day 3 · Tue Mar 4 · locked" (and
 * amended, when it is) with "Next replay day" and "Amend" when one is.
 */
export function ReplayDayControl({ instrument, onPlanned }: { instrument?: string | null; onPlanned?: (d: ReplayDay) => void }) {
  const { state } = useReplay();
  const [building, setBuilding] = useState(false);
  const [amending, setAmending] = useState(false);
  const [closing, setClosing] = useState(false);
  if (!state) return null;
  const d = state.active;
  const chip = 'rounded-full border px-3 py-1 text-[11.5px]';
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-replay-control={d ? 'active' : 'none'}>
      {d ? (
        <>
          <span className={`${chip} font-medium`} style={{ borderColor: 'rgb(var(--accent) / 0.4)', color: 'rgb(var(--accent))', background: 'rgb(var(--accent) / 0.06)' }} data-replay-day={d.sequence}>
            Day {d.sequence} · {d.weekday ?? ''} {fmtDate(d.replay_date)} · locked{d.amended_at ? ' · amended' : ''}
          </span>
          <button type="button" className={chip} style={{ borderColor: 'var(--glass-stroke)', color: 'var(--text-dim)' }} onClick={() => setAmending(true)} data-amend>Amend</button>
          <button type="button" className={chip} style={{ borderColor: 'var(--glass-stroke)', color: 'var(--text-dim)' }} onClick={() => setClosing(true)} data-next-replay-day>Next replay day</button>
        </>
      ) : (
        <button type="button" className={`${chip} font-medium`} style={{ borderColor: 'rgb(var(--accent) / 0.4)', color: 'rgb(var(--accent))' }} onClick={() => setBuilding(true)} data-plan-replay-day>
          Plan replay day
        </button>
      )}
      <ReplayBuilder open={building} onClose={() => setBuilding(false)} last={state.last} instrument={instrument} onLocked={onPlanned} />
      <ReplayBuilder open={amending} onClose={() => setAmending(false)} last={state.last} amend={d} instrument={instrument} />
      <CloseDayDialog open={closing} onClose={() => setClosing(false)} day={d} trades={state.trades}
        onClosed={(next) => { setClosing(false); if (next) setBuilding(true); }} />
    </div>
  );
}

/* ───────────────────────── Step 1's plan strip ───────────────────────── */

/** The day's two plans, one line each, above the chart. The card matching the trade's direction is outlined — a hint, never a pick. */
export function PlanStrip({ day, direction }: { day: ReplayDay; direction: 'Long' | 'Short' | null }) {
  const s = day.scenarios;
  const capped = noBiasCap(day.context);
  return (
    <div className="grid max-h-[90px] gap-2 md:grid-cols-2" data-plan-strip>
      {(['a', 'b'] as const).map((k) => {
        const sc = s[k];
        const match = direction != null && sc.dir === direction;
        return (
          <div key={k} className="min-w-0 rounded-[12px] border px-3 py-1.5 text-[11.5px]" data-plan-card={k} data-match={match || undefined}
            style={{ borderColor: match ? 'rgb(var(--accent))' : 'var(--glass-stroke)', background: 'var(--glass-fill)', boxShadow: match ? '0 0 0 1px rgb(var(--accent) / 0.3)' : undefined }}>
            <span className="font-semibold" style={{ color: sc.dir ? `rgb(${dirTone(sc.dir)})` : 'var(--text)' }}>{k.toUpperCase()}</span>
            {capped && <span className="ml-1 text-[10px]" style={faint}>max B</span>}
            <span className="ml-1.5 block truncate" style={dim} title={scenarioLine(sc)}>{scenarioLine(sc)}</span>
          </div>
        );
      })}
    </div>
  );
}
