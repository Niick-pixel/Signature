'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Overlay } from '@/components/ui/Overlay';
import { Field, Input } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';
import { MultiSegmented } from '@/components/ui/MultiSegmented';
import { Button } from '@/components/ui/Button';
import {
  CONFIRMS, DAY_OUTCOMES, DAY_OUTCOME_LABEL, H4, KILLS, MAJOR_SWING_HELP, MAX_ZONES, NEWS, NOTHING_TAKEN, OPEN_LOCATIONS, RR_BANDS, SCENARIO_C, TAKEN_LEVELS, TOOK, TOOK_LABEL,
  copyPlan, dayBias, emptyContext, emptyScenarios, lockMissing, nextWeekday, noBiasCap, playedOf, rrWarning, scenarioLine, targetOptions,
  overnightOf, tidyScenarios, tookFromTrades, weekdayOf, withDirections, zoneOptions,
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

/* ───────────────────────── a group of choices ───────────────────────── */

/**
 * One question, in the app's own controls: a Field label (lit with
 * "· required" until answered, as on New trade) over a Segmented row, or its
 * multi-select twin. The lit group — the one the number keys pick in — gets
 * a soft accent ring and shows its 1–n key range.
 */
function Chips<T extends string>({ id, label, options, value, onChange, multi = false, max, focused, onFocus, labelFor, tone, hint, required, className = '', titleFor }: {
  id: string; label: string; options: readonly T[]; value: T | T[] | null; onChange: (v: T | T[] | null) => void;
  multi?: boolean; max?: number; focused: boolean; onFocus: () => void; labelFor?: (v: T) => string;
  tone?: (v: T) => string | undefined; hint?: string; required?: boolean; className?: string; titleFor?: (v: T) => string | undefined;
}) {
  const picked = multi ? (value as T[] | null) ?? [] : value != null ? [value as T] : [];
  const keys = <span className="rounded-[5px] border px-1 py-px text-[9.5px] font-medium tabular-nums" style={{ borderColor: 'var(--glass-stroke)', color: 'var(--text-faint)', opacity: focused ? 1 : 0 }}>1–{Math.min(9, options.length)}</span>;
  return (
    <div data-replay-group={id} onMouseDown={onFocus} className={`rounded-[calc(18px*var(--rk))] p-1 transition-shadow ${className}`}
      style={{ boxShadow: focused ? '0 0 0 1.5px rgb(var(--accent) / 0.35)' : undefined }}>
      <Field quiet group label={multi ? `${label}${max ? ` · up to ${max}` : ' · any'}` : label} hint={hint} required={required && !picked.length} badge={keys}>
        {multi ? (
          <MultiSegmented value={picked} onChange={(v) => onChange(v)} options={options} max={max} labelFor={labelFor} accentFor={tone} titleFor={titleFor} />
        ) : (
          <Segmented value={(value as T | null) ?? ('' as T)} onChange={(v) => onChange(value === v ? null : v)} options={options} labelFor={labelFor} titleFor={titleFor ? (v) => titleFor(v) ?? '' : undefined} accentFor={tone ? (v) => tone(v) ?? 'var(--accent)' : undefined} />
        )}
      </Field>
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
    <Overlay open={props.open} onClose={props.onClose} className="max-h-[calc(100dvh-2rem)] w-full max-w-[72rem] overflow-y-auto rounded-[calc(24px*var(--rk))] p-5" surface="color-mix(in srgb, var(--bg-raised) 96%, transparent)">
      {/* Mounted fresh on every opening: it starts from the next date and an empty (or the amended) plan. */}
      {props.open && <BuilderBody {...props} />}
    </Overlay>
  );
}

function BuilderBody({ open, onClose, last, amend, instrument, onLocked }: BuilderProps) {
  const start = amend ? copyPlan({ context: amend.amended_context ?? amend.context, scenarios: amend.amended_scenarios ?? amend.scenarios }) : null;
  // The replayed date, never today's: the last replay date + one trading day; the very first is typed.
  const [date, setDate] = useState(() => (amend ? amend.replay_date : last ? nextWeekday(last.replay_date) : ''));
  const [context, setContext] = useState<ReplayContext>(() => start?.context ?? emptyContext());
  const [raw, setRaw] = useState<ReplayScenarios>(() => start?.scenarios ?? emptyScenarios());
  const [focus, setFocus] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Kept in step with the context: what was taken, the direction and the news decide what can be picked.
  const s = tidyScenarios(context, withDirections(context, raw));
  const taken = context.taken;
  const takenValue = taken == null ? [] : taken.length ? taken : [NOTHING_TAKEN];
  const setTaken = (v: string[]) => {
    const fresh = v.filter((x) => !takenValue.includes(x));
    const next = fresh.includes(NOTHING_TAKEN) ? [] : v.filter((x) => x !== NOTHING_TAKEN);
    setContext((c) => ({ ...c, taken: v.length ? next : null, overnight: v.length ? overnightOf(next) : null }));
  };
  const swingTitle = (o: string) => (/Major swing/.test(o) ? MAJOR_SWING_HELP : undefined);
  const bias = dayBias(context);
  const missing = useMemo(() => [...(/^\d{4}-\d{2}-\d{2}$/.test(date) ? [] : ['the replay date']), ...lockMissing(context, raw)], [date, context, raw]);
  const setA = (p: Partial<ReplayScenario>) => setRaw((r) => ({ ...r, a: { ...r.a, ...p } }));
  const setB = (p: Partial<ReplayScenario>) => setRaw((r) => ({ ...r, b: { ...r.b, ...p } }));
  const setC = (p: Partial<ReplayContext>) => setContext((c) => ({ ...c, ...p }));

  // The groups in order, for the keyboard: each one's options and how to pick by index.
  type G = { id: string; options: readonly string[]; pick: (o: string) => void };
  const groups: G[] = useMemo(() => {
    const scen = (k: 'a' | 'b', sc: ReplayScenario, set: (p: Partial<ReplayScenario>) => void): G[] => [
      ...(k === 'a' && !bias ? [{ id: 'a-dir', options: ['Long', 'Short'], pick: (o: string) => set({ dir: sc.dir === o ? null : o as 'Long' }) }] : []),
      { id: `${k}-zones`, options: zoneOptions(sc.dir, context.news, context.taken), pick: (o) => set({ zones: sc.zones.includes(o) ? sc.zones.filter((z) => z !== o) : [...sc.zones, o].slice(-MAX_ZONES) }) },
      { id: `${k}-confirm`, options: CONFIRMS, pick: (o) => set({ confirm: sc.confirm.includes(o) ? sc.confirm.filter((z) => z !== o) : [...sc.confirm, o] }) },
      { id: `${k}-target`, options: targetOptions(context.news, sc.dir, context.taken), pick: (o) => set({ target: sc.target === o ? null : o }) },
      { id: `${k}-rr`, options: RR_BANDS, pick: (o) => set({ rr: sc.rr === o ? null : o as ReplayScenario['rr'] }) },
      { id: `${k}-kill`, options: KILLS, pick: (o) => set({ kill: sc.kill === o ? null : o as ReplayScenario['kill'] }) },
    ];
    return [
      { id: 'h4', options: H4, pick: (o) => setC({ h4: context.h4 === o ? null : o as ReplayContext['h4'], ...(o === 'None' ? { h1Agrees: null } : {}) }) },
      ...(context.h4 && context.h4 !== 'None' ? [{ id: 'h1', options: ['Yes', 'No'], pick: (o: string) => setC({ h1Agrees: o === 'Yes' }) }] : []),
      { id: 'taken', options: [...TAKEN_LEVELS, NOTHING_TAKEN], pick: (o) => setTaken(takenValue.includes(o) ? takenValue.filter((x) => x !== o) : [...takenValue, o]) },
      { id: 'news', options: NEWS, pick: (o) => setC({ news: context.news === o ? null : o as ReplayContext['news'] }) },
      { id: 'open', options: OPEN_LOCATIONS, pick: (o) => setC({ open: context.open === o ? null : o as ReplayContext['open'] }) },
      ...scen('a', s.a, setA), ...scen('b', s.b, setB),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context, s, bias]);
  const fid = groups[Math.min(focus, groups.length - 1)]?.id;
  const focusOn = (id: string) => setFocus(Math.max(0, groups.findIndex((g) => g.id === id)));

  const lock = useCallback(async () => {
    if (missing.length) { setError(`Still to tap: ${missing.join(', ')}.`); return; }
    setSaving(true); setError(null);
    // Amend: a corrected date moves the day (and its trades) without touching the plan;
    // the plan itself is saved as an amendment only if it changed.
    if (amend && date !== amend.replay_date) {
      const r = await fetch('/api/replay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'redate', id: amend.id, replay_date: date }) }).catch(() => null);
      if (!r || !r.ok) { setSaving(false); setError((await r?.json().catch(() => null))?.error ?? 'Could not change the date.'); return; }
      const before = JSON.stringify([start?.context, start?.scenarios ? tidyScenarios(start.context, withDirections(start.context, start.scenarios)) : null]);
      if (before === JSON.stringify([context, s])) { setSaving(false); changed(); onLocked?.(await r.json() as ReplayDay); onClose(); return; }
    }
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
  }, [missing, amend, context, s, date, instrument, last, onLocked, onClose, start]);

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
      // Six rows on a subgrid shared by A and B: each question sits beside its twin, so a scenario
      // with fewer zones (some taken) leaves a little room in that row, not an empty block at the bottom.
      <div className="row-span-6 grid grid-rows-subgrid gap-y-2 rounded-[calc(18px*var(--rk))] border p-3" style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }} data-replay-scenario={k}>
        <div>
        <div className="flex items-baseline justify-between px-1">
          <span className="text-[14px] font-semibold">Scenario {k.toUpperCase()}</span>
          <span className="text-[11.5px]" style={{ color: sc.dir ? `rgb(${dirTone(sc.dir)})` : 'var(--text-faint)' }}>
            {sc.dir ?? 'direction —'}{k === 'a' ? (bias ? ' · with the bias' : ' · no bias: tap it') : ' · the other way'}{!bias && ' · max B'}
          </span>
        </div>
        {k === 'a' && !bias && (
          <Chips id="a-dir" label="Direction" options={['Long', 'Short'] as const} value={sc.dir} onChange={(v) => set({ dir: v as 'Long' | null })}
            focused={fid === 'a-dir'} onFocus={() => focusOn('a-dir')} tone={dirTone} required />
        )}
        </div>
        <Chips id={`${k}-zones`} label="Trigger zone" options={zoneOptions(sc.dir, context.news, context.taken)} value={sc.zones} multi max={MAX_ZONES}
          onChange={(v) => set({ zones: v as string[] })} focused={fid === `${k}-zones`} onFocus={() => focusOn(`${k}-zones`)} required titleFor={swingTitle}
          hint={`The high side for a short, the low side for a long; a level taken before the open is not offered. The data wick appears on a news day. Major swing: ${MAJOR_SWING_HELP}`} />
        <Chips id={`${k}-confirm`} label="Confirmation" options={CONFIRMS} value={sc.confirm} multi onChange={(v) => set({ confirm: v as string[] })}
          focused={fid === `${k}-confirm`} onFocus={() => focusOn(`${k}-confirm`)} required />
        <Chips id={`${k}-target`} label="First target" options={targetOptions(context.news, sc.dir, context.taken)} value={sc.target} onChange={(v) => set({ target: v as string | null })}
          focused={fid === `${k}-target`} onFocus={() => focusOn(`${k}-target`)} required titleFor={swingTitle}
          hint="A target already run before the open is not offered: a long aims above, a short below." />
        <div>
        <Chips id={`${k}-rr`} label="Rough R" options={RR_BANDS} value={sc.rr} onChange={(v) => set({ rr: v as ReplayScenario['rr'] })}
          focused={fid === `${k}-rr`} onFocus={() => focusOn(`${k}-rr`)} tone={(o) => (o === '<1.5' ? LOSS : undefined)} required />
        {warn && <p className="px-2 text-[11.5px] font-medium" style={{ color: `rgb(${LOSS})` }} data-rr-warning>{warn}</p>}
        </div>
        <Chips id={`${k}-kill`} label="Kill switch" options={KILLS} value={sc.kill} onChange={(v) => set({ kill: v as ReplayScenario['kill'] })}
          focused={fid === `${k}-kill`} onFocus={() => focusOn(`${k}-kill`)} required />
      </div>
    );
  };

  return (
      <div data-replay-builder={amend ? 'amend' : 'plan'}>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[20px] font-semibold">{amend ? `Amend Day ${amend.sequence}` : 'Plan replay day'} <span className="text-[13px] font-medium" style={faint}>· backtest</span></h1>
            <p className="mt-0.5 text-[12.5px]" style={dim}>
              {amend ? 'The locked plan stays as it was; this is kept beside it, and the day shows as amended everywhere.'
                : 'Taps only. Keys: 1–9 pick in the lit group · Tab / ↑ ↓ move · Enter locks.'}
            </p>
          </div>
          <div className="flex items-end gap-2">
            <div className="w-[12.5rem]">
              <Field quiet label={`Replay date${date ? ` · ${weekdayOf(date) ?? 'weekend'}` : ''}`}>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-replay-date
                  title={amend ? 'A wrong date can be put right: the day and its trades move, the plan is not amended.' : 'The day you are replaying — the next one is this + one trading day.'} />
              </Field>
            </div>
            {!amend && last && (
              <Button onClick={() => { const p = copyPlan(last); setContext(p.context); setRaw(p.scenarios); }} data-copy-last>Copy last day</Button>
            )}
          </div>
        </div>

        {/* Context. */}
        <div className="grid gap-x-4 gap-y-2 rounded-[calc(18px*var(--rk))] border p-3 md:grid-cols-3" style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }}>
          <Chips id="h4" label="4H direction" options={H4} value={context.h4} onChange={(v) => setC({ h4: v as ReplayContext['h4'], ...(v === 'None' ? { h1Agrees: null } : {}) })}
            focused={fid === 'h4'} onFocus={() => focusOn('h4')} tone={(o) => (o === 'Bull' ? WIN : o === 'Bear' ? LOSS : undefined)} required />
          {context.h4 && context.h4 !== 'None' ? (
            <Chips id="h1" label="1H agrees with 4H" options={['Yes', 'No'] as const} value={context.h1Agrees == null ? null : context.h1Agrees ? 'Yes' : 'No'}
              onChange={(v) => setC({ h1Agrees: v == null ? null : v === 'Yes' })} focused={fid === 'h1'} onFocus={() => focusOn('h1')} required />
          ) : (
            <div className="p-1">
              <Field quiet label="1H agrees with 4H">
                <div className="glass flex rounded-[calc(16px*var(--rk))] p-1">
                  <span className="flex-1 px-3 py-2 text-center text-[12px]" style={dim}>{context.h4 === 'None' ? 'No 4H direction — nothing to agree with' : 'Pick the 4H direction first'}</span>
                </div>
              </Field>
            </div>
          )}
          <div className="p-1" data-day-bias={bias ?? 'none'}>
            <Field quiet label="Day bias · derived" hint="The 4H direction when the 1H agrees; otherwise no bias, and both scenarios are capped at B.">
              <div className="glass flex rounded-[calc(16px*var(--rk))] p-1">
                <span className="flex-1 rounded-[calc(12px*var(--rk))] border px-3 py-2 text-center text-[12px] font-semibold"
                  style={bias ? { color: `rgb(${dirTone(bias)})`, background: `rgb(${dirTone(bias)} / 0.16)`, borderColor: `rgb(${dirTone(bias)} / 0.5)` } : { color: 'var(--text-dim)', borderColor: 'transparent' }}>
                  {bias ?? 'No bias — both scenarios max B'}
                </span>
              </div>
            </Field>
          </div>
          <Chips id="taken" label="Taken before the open" options={[...TAKEN_LEVELS, NOTHING_TAKEN]} value={takenValue} multi onChange={(v) => setTaken(v as string[])}
            focused={fid === 'taken'} onFocus={() => focusOn('taken')} required={taken == null} className="md:col-span-2"
            hint="Each level run before the open leaves the trigger zones and the targets. Overnight follows from it." />
          <div className="p-1" data-overnight={context.overnight ?? ''}>
            <Field quiet label="Overnight · derived" hint="From the levels taken: highs, lows, both or neither.">
              <div className="glass flex rounded-[calc(16px*var(--rk))] p-1">
                <span className="flex-1 rounded-[calc(12px*var(--rk))] px-3 py-2 text-center text-[12px] font-semibold" style={{ color: context.overnight ? 'var(--text)' : 'var(--text-dim)' }}>
                  {context.overnight ?? 'Tap what was taken'}
                </span>
              </div>
            </Field>
          </div>
          <Chips id="news" label="News" options={NEWS} value={context.news} onChange={(v) => setC({ news: v as ReplayContext['news'] })}
            focused={fid === 'news'} onFocus={() => focusOn('news')} required hint="On a news day the data wick becomes a trigger zone and a target." className="md:col-span-2" />
          <Chips id="open" label="Open location" options={OPEN_LOCATIONS} value={context.open} onChange={(v) => setC({ open: v as ReplayContext['open'] })}
            focused={fid === 'open'} onFocus={() => focusOn('open')} required />
        </div>

        {/* A, B and C. */}
        <div className="mt-3 grid gap-x-3 gap-y-3 md:grid-cols-2">
          {scenarioCol('a', s.a, setA)}
          {scenarioCol('b', s.b, setB)}
        </div>
        <p className="mt-3 rounded-[calc(14px*var(--rk))] border px-3 py-2 text-[12px]" style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)', color: 'var(--text-dim)' }}>
          <b style={{ color: 'var(--text)' }}>Scenario C</b> — {SCENARIO_C}
        </p>

        {/* The footer stays in view while the plan scrolls on a short window. */}
        <div className="sticky -bottom-5 -mx-5 -mb-5 mt-3 flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3"
          style={{ borderColor: 'var(--glass-stroke)', background: 'color-mix(in srgb, var(--bg-raised) 96%, transparent)' }} data-builder-footer>
          <p className="min-w-0 text-[11.5px]" style={error ? { color: `rgb(${LOSS})` } : faint} role={error ? 'alert' : undefined}>
            {error ?? (missing.length ? `Still to tap: ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? `, +${missing.length - 6}` : ''}.` : 'Ready to lock.')}
          </p>
          <div className="flex gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={() => void lock()} disabled={saving} data-lock-play>
              {amend ? 'Save amendment' : 'Lock & play'} <span className="opacity-70">↵</span>
            </Button>
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
        <div className="mt-3" data-day-outcomes>
          <Field quiet group label="What played out today?" required={!outcome}>
            <Segmented value={outcome ?? ('' as DayOutcome)} onChange={setOutcome} options={DAY_OUTCOMES} labelFor={(o) => DAY_OUTCOME_LABEL[o]} />
          </Field>
        </div>
        {played.map((k) => (
          <div key={k} className="mt-3" data-took-for={k}>
            <Field quiet group label={`Scenario ${k} played — did I take it?${tookFromTrades(trades, k) ? ' · from the day’s trades' : ''}`}>
              <Segmented value={took[k] ?? ('' as Took)} onChange={(t) => setTook((x) => ({ ...x, [k]: t }))} options={TOOK} labelFor={(t) => TOOK_LABEL[t]}
                accentFor={(t) => (t === 'yes' ? WIN : t === 'missed' ? LOSS : 'var(--grade-b)')} />
            </Field>
          </div>
        ))}
        {error && <p className="mt-2 text-[12px]" style={{ color: `rgb(${LOSS})` }} role="alert">{error}</p>}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button onClick={() => void save(false)} data-end-sitting>Close & end the sitting</Button>
          <Button variant="primary" onClick={() => void save(true)} data-next-day>Close & plan the next day</Button>
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
  const [viewing, setViewing] = useState(false);
  // While one of these is open over Step 1, its keys are the dialog's (DecisionFlow reads this).
  const anyOpen = building || amending || closing || viewing;
  useEffect(() => {
    if (!anyOpen) return;
    document.documentElement.dataset.replayDialog = '1';
    return () => { delete document.documentElement.dataset.replayDialog; };
  }, [anyOpen]);
  if (!state) return null;
  const d = state.active;
  const chip = 'rounded-full border px-3 py-1 text-[11.5px]';
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-replay-control={d ? 'active' : 'none'}>
      {d ? (
        <>
          <button type="button" onClick={() => setViewing(true)} title="View the plan" className={`${chip} font-medium`}
            style={{ borderColor: 'rgb(var(--accent) / 0.4)', color: 'rgb(var(--accent))', background: 'rgb(var(--accent) / 0.06)' }} data-replay-day={d.sequence}>
            Day {d.sequence} · {d.weekday ?? ''} {fmtDate(d.replay_date)} · locked{d.amended_at ? ' · amended' : ''}
            <span className="ml-1.5 opacity-70" aria-hidden>▸ plan</span>
          </button>
          <button type="button" className={chip} style={{ borderColor: 'var(--glass-stroke)', color: 'var(--text-dim)' }} onClick={() => setAmending(true)} data-amend>Amend</button>
          <button type="button" className={chip} style={{ borderColor: 'var(--glass-stroke)', color: 'var(--text-dim)' }} onClick={() => setClosing(true)} data-next-replay-day>Next replay day</button>
        </>
      ) : (
        <button type="button" className={`${chip} font-medium`} style={{ borderColor: 'rgb(var(--accent) / 0.4)', color: 'rgb(var(--accent))' }} onClick={() => setBuilding(true)} data-plan-replay-day>
          Plan replay day
        </button>
      )}
      <PlanView open={viewing} day={d} trades={state.trades} onClose={() => setViewing(false)} onAmend={() => { setViewing(false); setAmending(true); }} />
      <ReplayBuilder open={building} onClose={() => setBuilding(false)} last={state.last} instrument={instrument} onLocked={onPlanned} />
      <ReplayBuilder open={amending} onClose={() => setAmending(false)} last={state.last} amend={d} instrument={instrument} />
      <CloseDayDialog open={closing} onClose={() => setClosing(false)} day={d} trades={state.trades}
        onClosed={(next) => { setClosing(false); if (next) setBuilding(true); }} />
    </div>
  );
}

/* ───────────────────────── the plan, read back ───────────────────────── */

/**
 * The locked day's plan, read-only: a reminder before a trade and a review
 * after one. The context, A and B in full, C, and what was taken so far. An
 * amendment shows under the original, which is what counts.
 */
function PlanView({ open, day, trades, onClose, onAmend }: {
  open: boolean; day: ReplayDay | null; trades: ReplayState['trades']; onClose: () => void; onAmend: () => void;
}) {
  return (
    <Overlay open={open && day != null} onClose={onClose} className="max-h-[calc(100dvh-2rem)] w-full max-w-[60rem] overflow-y-auto rounded-[calc(24px*var(--rk))] p-5" surface="color-mix(in srgb, var(--bg-raised) 96%, transparent)">
      {day && (
        <div data-plan-view>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-[20px] font-semibold">Day {day.sequence} · {day.weekday ?? ''} {fmtDate(day.replay_date)} <span className="text-[13px] font-medium" style={faint}>· locked{day.amended_at ? ' · amended' : ''}</span></h1>
              <p className="mt-0.5 text-[12.5px]" style={dim}>The plan as it was locked — a reminder, not a form. {day.instrument ?? ''}</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={onAmend}>Amend</Button>
              <Button variant="primary" onClick={onClose}>Close</Button>
            </div>
          </div>
          <PlanBody context={day.context} scenarios={day.scenarios} />
          {day.amended_at && day.amended_context && day.amended_scenarios && (
            <div className="mt-4" data-plan-view-amended>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'rgb(var(--amber))' }}>Amended after locking — the original above is what counts</p>
              <PlanBody context={day.amended_context} scenarios={day.amended_scenarios} />
            </div>
          )}
          <div className="mt-3 rounded-[calc(14px*var(--rk))] border px-3 py-2 text-[12px]" style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }} data-plan-view-trades>
            <b>Today so far: </b>
            {trades.length ? trades.map((t) => `${t.plan_scenario === 'none' ? 'Unplanned' : t.plan_scenario ?? '—'} ${t.decision === 'take' ? 'taken' : t.decision === 'pass' ? 'passed' : 'missed'}${t.r != null ? ` (${t.r > 0 ? '+' : ''}${t.r}R)` : ''}`).join(' · ')
              : <span style={dim}>no trades on this day yet.</span>}
          </div>
        </div>
      )}
    </Overlay>
  );
}

function PlanBody({ context: c, scenarios: s }: { context: ReplayContext; scenarios: ReplayScenarios }) {
  const bias = dayBias(c);
  const row = (label: string, value: ReactNode) => (
    <div className="flex items-baseline justify-between gap-3 py-0.5 text-[12px]"><span style={faint}>{label}</span><span className="text-right">{value ?? '—'}</span></div>
  );
  const card = (k: 'a' | 'b') => {
    const sc = s[k];
    return (
      <div className="rounded-[calc(14px*var(--rk))] border p-3" style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }} data-plan-view-scenario={k}>
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-[13px] font-semibold">Scenario {k.toUpperCase()}</span>
          <span className="text-[11.5px] font-medium" style={{ color: sc.dir ? `rgb(${dirTone(sc.dir)})` : 'var(--text-faint)' }}>
            {sc.dir ?? '—'}{k === 'a' ? (bias ? ' · with the bias' : '') : ' · the other way'}{!bias && ' · max B'}
          </span>
        </div>
        {row('Trigger zone', sc.zones.join(' + ') || null)}
        {row('Confirmation', sc.confirm.join(', ') || null)}
        {row('First target', sc.target)}
        {row('Rough R', sc.rr ? <span style={sc.rr === '<1.5' ? { color: `rgb(${LOSS})` } : undefined}>{sc.rr}R</span> : null)}
        {row('Kill switch', sc.kill)}
      </div>
    );
  };
  return (
    <div className="space-y-3">
      <div className="grid gap-x-6 rounded-[calc(14px*var(--rk))] border px-3 py-2 sm:grid-cols-2" style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }} data-plan-view-context>
        <div>
          {row('4H direction', c.h4)}
          {row('1H agrees', c.h4 && c.h4 !== 'None' ? (c.h1Agrees ? 'Yes' : 'No') : null)}
          {row('Day bias', bias ? <span style={{ color: `rgb(${dirTone(bias)})` }}>{bias}</span> : 'No bias — both max B')}
        </div>
        <div>
          {row('Taken before the open', c.taken ? (c.taken.join(', ') || 'Nothing') : null)}
          {row('Overnight', c.overnight)}
          {row('News · open in', `${c.news ?? '—'} · ${c.open ?? '—'}`)}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">{card('a')}{card('b')}</div>
      <p className="rounded-[calc(14px*var(--rk))] border px-3 py-2 text-[12px]" style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)', ...dim }}>
        <b style={{ color: 'var(--text)' }}>Scenario C</b> — {SCENARIO_C}
      </p>
    </div>
  );
}

/* ───────────────────────── Step 1's plan strip ───────────────────────── */

/** The day's two plans, one line each, above the chart. The card matching the trade's direction is outlined — a hint, never a pick. */
export type PlanCard = { k: 'a' | 'b'; dir: string | null; line: string | null; capped?: boolean };

/**
 * The plan section on Step 1: always there, always one height, so the chart
 * under it never moves. A and B side by side when there is a plan; when there
 * is none, a warning in the same space saying so — and what that means.
 */
export function PlanStrip({ cards, direction, title, empty, action }: {
  cards: PlanCard[] | null; direction: 'Long' | 'Short' | null;
  /** What the plan is: "Day 2 · Wed Mar 4", "This morning's prep". */
  title: string;
  /** No plan: what that means for this trade. */
  empty: ReactNode;
  action?: ReactNode;
}) {
  if (!cards) {
    return (
      <div className="flex h-[3.25rem] items-center justify-between gap-3 rounded-[12px] border px-3 text-[11.5px]" data-plan-strip="none"
        style={{ borderColor: 'rgb(var(--amber) / 0.5)', background: 'rgb(var(--amber) / 0.08)' }}>
        <p className="min-w-0 leading-snug" data-no-plan>
          <b style={{ color: 'rgb(var(--amber))' }}>No plan · </b><span style={dim}>{empty}</span>
        </p>
        {action}
      </div>
    );
  }
  return (
    <div className="grid h-[3.25rem] gap-2 md:grid-cols-2" data-plan-strip="plan" title={title}>
      {cards.map((c) => {
        const match = direction != null && c.dir === direction;
        return (
          <div key={c.k} className="flex min-w-0 flex-col justify-center rounded-[12px] border px-3 text-[11.5px]" data-plan-card={c.k} data-match={match || undefined}
            style={{ borderColor: match ? 'rgb(var(--accent))' : 'var(--glass-stroke)', background: 'var(--glass-fill)', boxShadow: match ? '0 0 0 1px rgb(var(--accent) / 0.3)' : undefined }}>
            <span className="truncate text-[10.5px]" style={faint}>
              <b className="text-[11.5px]" style={{ color: c.dir ? `rgb(${dirTone(c.dir)})` : 'var(--text)' }}>{c.k.toUpperCase()}</b>
              {c.dir && <span style={{ color: `rgb(${dirTone(c.dir)})` }}> · {c.dir}</span>}
              {c.capped && ' · max B'} · {title}
            </span>
            <span className="block truncate" style={dim} title={c.line ?? undefined}>{c.line ?? 'Not written.'}</span>
          </div>
        );
      })}
    </div>
  );
}

/** A replay day's A and B, as plan cards. */
export const replayCards = (day: ReplayDay): PlanCard[] => {
  // The locked original, as everywhere else (planOf); an amendment only flags the day.
  const s = day.scenarios;
  const capped = noBiasCap(day.context);
  // The card already says the direction; the line starts at the zones.
  return (['a', 'b'] as const).map((k) => ({ k, dir: s[k].dir, line: scenarioLine(s[k])?.replace(/^(Long|Short) · /, '') ?? null, capped }));
};
