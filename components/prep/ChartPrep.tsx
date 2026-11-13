'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { localDay } from '@/lib/day';
import { nyMinutes as nyMinutesOf } from '@/lib/planMatch';
import { press, spring, springSoft } from '@/lib/motion';
import {
  EMPTY_PREP, PREP_STEPS, TAKEN_KEY, WAIT_KEY, answerKey, answerText, biasSentence, deriveDecisions, gradeCeiling, liveMarks,
  overnightRead, planChecks, planSummary, prepProgress, scenarioC, stepsOf, withWeeklyTaken, notOffered, takenOf, tidyPlans,
  type Answer, type PrepData, type PrepField, type PrepStep, type SessionPrep,
} from '@/lib/prep';
import type { DailyReview } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { usePreferences } from '@/components/shell/PreferencesProvider';
import { figuresLine } from '@/lib/news';

export const PREP_SAVED = 'signature:prep';

/** Minutes until 09:30 in New York, today — negative once the session has opened. */
function minutesToOpen(now = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24;
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return 9 * 60 + 30 - (h * 60 + m);
}
function openLine(mins: number): string {
  if (mins > 0) return `New York opens in ${mins >= 60 ? `${Math.floor(mins / 60)}h ` : ''}${mins % 60}m`;
  if (mins > -150) return 'New York is open — a late prep, and that is worth knowing';
  return 'After the New York session';
}

/**
 * The chart half of the check-in: six steps, top-down, one at a time, every
 * answer written down — news, the bias sentence, what was taken overnight,
 * the liquidity map, location, and the two plans (and C). Saved as it goes;
 * any step can be skipped; the dots at the top jump anywhere.
 */
export function ChartPrep({ review, onClose }: { review: DailyReview | null; onClose: () => void }) {
  const [day] = useState(() => localDay());
  const [data, setData] = useState<PrepData | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [at, setAt] = useState(0);
  const [finished, setFinished] = useState(false);
  const [saved, setSaved] = useState(false);
  const [carried, setCarried] = useState<Array<{ level: string; day: string }>>([]);
  const touched = useRef(false);
  const mins = minutesToOpen();

  useEffect(() => {
    fetch(`/api/prep?day=${day}`).then((r) => r.json()).then((res: { prep: SessionPrep | null; weeklyTaken?: Array<{ level: string; day: string }> }) => {
      // PWH/PWL taken earlier this week stay taken (lib/prep withWeeklyTaken).
      const week = res.weeklyTaken ?? [];
      setCarried(week);
      const d = withWeeklyTaken(res.prep?.data ?? structuredClone(EMPTY_PREP), week);
      setData(d);
      setStartedAt(res.prep?.started_at ?? null);
      const first = PREP_STEPS.findIndex((s) => !d.steps[s.id]);
      setAt(first === -1 ? 0 : first);
      setFinished(first === -1);
    }).catch(() => setData(structuredClone(EMPTY_PREP)));
  }, [day]);

  const save = useCallback(async (next: PrepData, complete = false) => {
    const res = await fetch('/api/prep', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ day, data: next, complete }),
    }).catch(() => null);
    if (!res?.ok) return;
    const prep = await res.json() as SessionPrep;
    setStartedAt(prep.started_at);
    setSaved(true);
    window.dispatchEvent(new CustomEvent(PREP_SAVED, { detail: prep }));
  }, [day]);

  // A beat after the last tap, so a run of ticks is one save.
  useEffect(() => {
    if (!data || !touched.current) return;
    const t = window.setTimeout(() => void save(data), 400);
    return () => window.clearTimeout(t);
  }, [data, save]);

  const change = useCallback((fn: (d: PrepData) => PrepData) => {
    touched.current = true;
    setData((d) => (d ? fn(structuredClone(d)) : d));
  }, []);

  if (!data) return <div className="grid h-48 place-items-center text-[12px]" style={{ color: 'var(--text-faint)' }}>Opening the chart prep…</div>;

  const step = PREP_STEPS[at];
  const progress = prepProgress(data);

  const mark = (state: 'done' | 'skipped') => {
    const next = structuredClone(data);
    next.steps[step.id] = state;
    touched.current = true;
    setData(next);
    const after = PREP_STEPS.findIndex((s, i) => i > at && !next.steps[s.id]);
    const any = PREP_STEPS.findIndex((s) => !next.steps[s.id]);
    if (after !== -1) setAt(after);
    else if (any !== -1) setAt(any);
    else { setFinished(true); void save(next, true); }
  };

  return (
    <div data-chart-prep>
      {/* Where you are: one dot per step, each a jump. */}
      <div className="mb-5 flex items-center gap-1.5" role="tablist" aria-label="Chart prep steps">
        {PREP_STEPS.map((s, i) => {
          const state = data.steps[s.id];
          const here = i === at && !finished;
          return (
            <motion.button key={s.id} type="button" role="tab" aria-selected={here} title={s.title}
              data-prep-dot={s.id} data-state={state ?? 'open'}
              onClick={() => { setFinished(false); setAt(i); }}
              className="h-1.5 rounded-full"
              initial={false}
              animate={{
                flexGrow: here ? 3 : 1,
                background: state === 'done' ? 'rgb(var(--outcome-win))'
                  : state === 'skipped' ? 'var(--text-faint)'
                  : here ? 'rgb(var(--accent))' : 'var(--glass-stroke)',
                opacity: state === 'skipped' ? 0.45 : 1,
              }}
              transition={springSoft}
              style={{ flexBasis: 0 }} />
          );
        })}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {finished ? (
          <motion.div key="ready" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }} transition={springSoft}>
            <Ready data={data} startedAt={startedAt} onReview={() => { setFinished(false); setAt(0); }} onClose={onClose} />
          </motion.div>
        ) : (
          <motion.div key={step.id} data-prep-current={step.id}
            initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8, transition: { duration: 0.12 } }} transition={springSoft}>
            <StepView step={step} index={at} data={data} change={change} review={review} carried={carried} />
            <div className="mt-6 flex items-center gap-2">
              {at > 0 && <Button onClick={() => setAt(at - 1)}>Back</Button>}
              <span className="text-[10.5px] tabular-nums" style={{ color: 'var(--text-faint)' }}>
                {progress.answered}/{progress.total}{saved ? ' · saved' : ''}
              </span>
              <div className="ml-auto flex gap-2">
                <Button onClick={() => mark('skipped')}>Skip</Button>
                <Button variant="primary" data-prep-next onClick={() => mark('done')}>
                  {at === PREP_STEPS.length - 1 ? 'Finish' : 'Next'}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <p data-open-countdown className="mt-4 text-center text-[10.5px]"
        style={{ color: mins > 0 ? 'var(--text-faint)' : 'rgb(var(--amber))' }}>
        {openLine(mins)}
      </p>
    </div>
  );
}

function StepView({ step, index, data, change, review, carried }: {
  step: PrepStep; index: number; data: PrepData; change: (fn: (d: PrepData) => PrepData) => void; review: DailyReview | null;
  carried: Array<{ level: string; day: string }>;
}) {
  const { prefs } = usePreferences();
  const ticks = data.ticks[step.id] ?? [];
  const toggle = (i: number) => change((d) => {
    const cur = new Set(d.ticks[step.id] ?? []);
    if (cur.has(i)) cur.delete(i); else cur.add(i);
    d.ticks[step.id] = [...cur].sort();
    return d;
  });
  const setAnswer = (field: PrepField, value: Answer | null) => change((d) => {
    const key = answerKey(step, field);
    if (value == null || (Array.isArray(value) && value.length === 0)) delete d.answers[key];
    else d.answers[key] = value;
    // Marked taken: no longer a sweep to wait for.
    const wait = d.answers[WAIT_KEY];
    if (key === TAKEN_KEY && Array.isArray(value) && Array.isArray(wait)) {
      const left = wait.filter((w) => !value.includes(w));
      if (left.length) d.answers[WAIT_KEY] = left; else delete d.answers[WAIT_KEY];
    }
    // The plans follow what is already answered (a level run overnight is not offered), then
    // the side, the sweeps to wait for and the target follow the plans (plan match reads them).
    d.answers = deriveDecisions(tidyPlans(d.answers, key));
    return d;
  });
  const f = (id: string) => step.fields.find((x) => x.id === id)!;
  const field = (id: string, extra: Partial<Parameters<typeof FieldView>[0]> = {}) => (
    <FieldView key={id} field={f(id)} value={data.answers[answerKey(step, f(id))]} onChange={(v) => setAnswer(f(id), v)} {...extra} />
  );

  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[10.5px] font-medium uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>
          Step {index + 1} of {PREP_STEPS.length}{step.frames ? ` · ${step.frames}` : ''}
        </p>
        {step.heatmap && prefs.heatmapUrl && (
          <a href={prefs.heatmapUrl} target="_blank" rel="noreferrer" data-heatmap-link
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11.5px] font-medium"
            style={{ borderColor: 'rgb(var(--accent) / 0.45)', background: 'rgb(var(--accent) / 0.1)', color: 'rgb(var(--accent))' }}>
            Open the heatmap
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M4 2h6v6M10 2L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        )}
      </div>
      <h3 className="mt-1 text-[19px] font-semibold tracking-tight">{step.title}</h3>

      {step.id === 'news' && (
        <SessionNews review={review} answered={data.answers['session.news'] != null} onAnswer={(v) => setAnswer(f('news'), v)} />
      )}

      {/* The marks — ticked as each goes on the chart (most steps now have none: they are written down). */}
      <div className={liveMarks(step).length ? 'mt-4 space-y-1.5' : 'hidden'}>
        {liveMarks(step).map(({ text: m, i }) => {
          const on = ticks.includes(i);
          return (
            <motion.button key={i} type="button" role="checkbox" aria-checked={on} data-mark={i}
              onClick={() => toggle(i)} whileTap={press}
              initial={{ opacity: 0, y: 5 }}
              animate={{
                opacity: 1, y: 0,
                borderColor: on ? 'rgb(var(--outcome-win) / 0.45)' : 'var(--glass-stroke)',
                background: on ? 'rgb(var(--outcome-win) / 0.08)' : 'var(--glass-fill)',
              }}
              transition={{ ...spring, delay: i * 0.035 }}
              className="flex w-full items-center gap-3 rounded-[calc(12px*var(--rk))] border px-3 py-2 text-left">
              <span className="grid size-[16px] shrink-0 place-items-center rounded-[calc(5px*var(--rk))]"
                style={{ background: on ? 'rgb(var(--outcome-win) / 0.2)' : 'var(--glass-fill-strong)' }}>
                <motion.svg width="10" height="8" viewBox="0 0 11 9" fill="none" aria-hidden style={{ color: 'rgb(var(--outcome-win))' }}
                  animate={{ scale: on ? 1 : 0, opacity: on ? 1 : 0 }} transition={spring}>
                  <path d="M1 4.6L4 7.5L10 1.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                </motion.svg>
              </span>
              <span className="text-[12.5px] leading-snug" style={{ color: on ? 'var(--text-dim)' : 'var(--text)' }}>{m}</span>
            </motion.button>
          );
        })}
      </div>

      {/* The answers, each written down. */}
      <div className="mt-5 space-y-4">
        {step.id === 'news' && <>
          {field('news')}
          {data.answers['session.news'] === 'Inside the killzone' && (
            <Rule>Red folder inside NY AM: no position through it — wait for the release candle’s range, then trade off it.</Rule>
          )}
        </>}

        {step.id === 'htf' && <HtfSentence data={data} field={field} />}

        {step.id === 'overnight' && <>
          {field('taken', { notes: Object.fromEntries(carried.map((c) => [c.level, `since ${weekday(c.day)}`])) })}
          {(() => {
            const r = overnightRead(data.answers);
            return (
              <div className="rounded-[calc(12px*var(--rk))] border px-3 py-2.5 text-[12.5px]" style={{ borderColor: 'var(--glass-stroke)' }} data-overnight-read>
                <p><span style={{ color: 'var(--text-faint)' }}>Still there: </span><b className="font-medium">{r.stillThere.join(', ') || 'nothing — every level was run'}</b></p>
                {r.line && <p className="mt-1" style={{ color: 'var(--text-dim)' }}>{r.line}</p>}
              </div>
            );
          })()}
        </>}

        {step.id === 'map' && (
          <div className="grid gap-3 sm:grid-cols-2">
            {(['above', 'below'] as const).map((side) => (
              <div key={side} className="space-y-3 rounded-[calc(14px*var(--rk))] border p-3" style={{ borderColor: 'var(--glass-stroke)' }} data-map-side={side}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-dim)' }}>{side === 'above' ? 'Above price' : 'Below price'}</p>
                {field(side, { hide: takenOf(data.answers) })}
                {field(`${side}Tier`)}
                {field(`${side}State`)}
                {field(side === 'above' ? 'gapAbove' : 'gapBelow')}
              </div>
            ))}
            <p className="text-[11.5px] sm:col-span-2" style={{ color: 'var(--text-faint)' }}>A 1H/4H gap between price and a level is where a move tends to end: a target stops short of it.</p>
          </div>
        )}

        {step.id === 'location' && field('zone')}

        {step.id === 'plans' && <Plans data={data} field={field} />}

        {/* An earlier version's step, opened from an old prep: its fields as they were. */}
        {!['news', 'htf', 'overnight', 'map', 'location', 'plans'].includes(step.id) && step.fields.filter((x) => !x.hidden).map((x) => (
          <FieldView key={x.id} field={x} value={data.answers[answerKey(step, x)]} onChange={(v) => setAnswer(x, v)}
            hide={answerKey(step, x) === WAIT_KEY ? (Array.isArray(data.answers[TAKEN_KEY]) ? data.answers[TAKEN_KEY] as string[] : []) : []} />
        ))}
      </div>
    </>
  );
}

const TONE: Record<string, string> = {
  Uptrend: 'var(--outcome-win)', Up: 'var(--outcome-win)', 'Longs only': 'var(--outcome-win)', Discount: 'var(--outcome-win)',
  Downtrend: 'var(--outcome-loss)', Down: 'var(--outcome-loss)', 'Shorts only': 'var(--outcome-loss)', Premium: 'var(--outcome-loss)',
  'No trade today': 'var(--amber)', 'Coin flip': 'var(--amber)', 'Being pulled': 'var(--amber)', 'Thin book': 'var(--amber)',
};

const weekday = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' });

function FieldView({ field, value, onChange, hide = [], notes = {} }: {
  field: PrepField; value: Answer | undefined; onChange: (v: Answer | null) => void;
  /** Options not offered (a level already taken, under "Sweep to wait for"). */
  hide?: readonly string[];
  /** A short note per option, e.g. "since Mon" on a weekly level carried in. */
  notes?: Record<string, string>;
}) {
  return (
    <div data-prep-field={field.id} role="group" aria-label={field.label}>
      <span className="mb-1.5 block text-[10.5px] font-medium uppercase tracking-[0.07em]" style={{ color: 'var(--text-faint)' }}>
        {field.label}{field.kind === 'many' && !field.max ? ' — any that apply' : ''}
      </span>
      {field.kind === 'text' ? (
        <TextAnswer value={typeof value === 'string' ? value : ''} placeholder={field.placeholder} long={field.long} label={field.label} onChange={(v) => onChange(v.trim() ? v : null)} />
      ) : field.kind === 'pick' ? (
        <div className="max-w-[16rem]">
          <Select value={typeof value === 'string' ? value : null} onChange={(v) => onChange(v)} options={field.options.filter((o) => !hide.includes(o) || o === value)} placeholder="Choose…" />
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {field.options.filter((o) => !hide.includes(o)).map((o) => {
            const on = field.kind === 'many' ? Array.isArray(value) && value.includes(o) : value === o;
            const tone = TONE[o] ?? 'var(--accent)';
            return (
              <motion.button key={o} type="button" aria-pressed={on} whileTap={press}
                onClick={() => {
                  if (field.kind === 'many') {
                    const cur = Array.isArray(value) ? value : [];
                    const next = on ? cur.filter((x) => x !== o) : [...cur, o];
                    onChange(field.max ? next.slice(-field.max) : next);
                  } else onChange(on ? null : o);
                }}
                animate={{
                  borderColor: on ? `rgb(${tone} / 0.55)` : 'var(--glass-stroke)',
                  background: on ? `rgb(${tone} / 0.13)` : 'var(--glass-fill)',
                  color: on ? `rgb(${tone})` : 'var(--text-dim)',
                }}
                transition={spring}
                className="rounded-full border px-3 py-1.5 text-[12px] font-medium">
                {o}
                {notes[o] && on && <span className="ml-1.5 text-[10.5px] font-normal opacity-70" data-carried={o}>{notes[o]}</span>}
              </motion.button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** The end: the answers in one place, to glance at before an entry. */
function Ready({ data, startedAt, onReview, onClose }: {
  data: PrepData; startedAt: string | null; onReview: () => void; onClose: () => void;
}) {
  const p = prepProgress(data);
  // The new prep ends on its plan (bias, A, B, C); an older one lists its answers.
  const rows = stepsOf(data) === PREP_STEPS ? planSummary(data.answers).map((r) => [r.label, r.value] as const)
    : stepsOf(data).flatMap((s) => s.fields.map((f) => [f.label, answerText(data.answers[answerKey(s, f)])] as const)).filter(([, v]) => v != null);
  return (
    <div data-prep-ready>
      <div className="flex items-center gap-3">
        <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={springSoft}
          className="grid size-10 shrink-0 place-items-center rounded-full"
          style={{ background: 'rgb(var(--outcome-win) / 0.14)', color: 'rgb(var(--outcome-win))' }}>
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path d="M5 10.5l3.2 3.2L15 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </motion.span>
        <div>
          <h3 className="text-[19px] font-semibold tracking-tight">Ready for New York</h3>
          <p className="text-[11.5px]" style={{ color: 'var(--text-dim)' }}>
            {p.done} of {p.total} marked{p.answered > p.done ? `, ${p.answered - p.done} skipped` : ''}
            {startedAt ? ` · started ${new Date(startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
          </p>
        </div>
      </div>
      {rows.length > 0 && (
        <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[12.5px]" data-prep-plan>
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt style={{ color: 'var(--text-faint)' }}>{k}</dt>
              <dd className="font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="mt-6 flex gap-2">
        <Button variant="primary" onClick={onClose}>Done</Button>
        <Button onClick={onReview}>Go through it again</Button>
      </div>
    </div>
  );
}

/** Today's prep progress, for the check-in chip — kept in step with saves. */
export function usePrepProgress(): { answered: number; total: number } | null {
  const [prep, setPrep] = useState<SessionPrep | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    fetch(`/api/prep?day=${localDay()}`).then((r) => r.json()).then((r) => { if (alive) setPrep(r.prep ?? null); })
      .catch(() => { if (alive) setPrep(null); });
    const on = (e: Event) => setPrep((e as CustomEvent<SessionPrep>).detail);
    window.addEventListener(PREP_SAVED, on);
    return () => { alive = false; window.removeEventListener(PREP_SAVED, on); };
  }, []);
  if (prep === undefined) return null;
  const p = prepProgress(prep?.data ?? EMPTY_PREP);
  return { answered: p.answered, total: p.total };
}

interface SessionNewsData { events: Array<{ id: string; at: string; title: string; impact: string; currency: string; forecast?: string | null; previous?: string | null }>; answer: string; window: { from: string; to: string }; currencies: string[]; auto: boolean; syncedAt: string | null; error?: string }

/**
 * Step 6's news: the red and orange releases inside your session (New York
 * time) from ForexFactory's calendar, and the News answer filled in from
 * them — still yours to change.
 */
function SessionNews({ review, answered, onAnswer }: { review: DailyReview | null; answered: boolean; onAnswer: (v: string) => void }) {
  const [d, setD] = useState<SessionNewsData | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => fetch(`/api/news/session?day=${localDay()}`).then((r) => r.json()).then((j: SessionNewsData) => setD(j)).catch(() => {}), []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (d && !answered && (d.syncedAt || d.events.length)) onAnswer(d.answer); }, [d]);
  const refresh = async () => { setBusy(true); await fetch('/api/news/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ force: true }) }); await load(); setBusy(false); };
  const ny = (at: string) => { const m = nyMinutesOf(at); return m == null ? at.slice(11, 16) : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')} NY`; };
  if (!d) return <p className="mt-2 text-[12px]" style={{ color: 'var(--text-faint)' }}>Reading the calendar…</p>;
  return (
    <div className="mt-2 rounded-[calc(12px*var(--rk))] border px-3 py-2.5 text-[12px]" style={{ borderColor: 'var(--glass-stroke)' }} data-session-news={d.events.length}>
      <div className="flex items-baseline justify-between gap-2">
        <span style={{ color: 'var(--text-dim)' }}>
          {d.events.length ? <>News in your session ({d.window.from}–{d.window.to} NY, {d.currencies.join('/')})</> : <>No red or orange {d.currencies.join('/')} news in your session ({d.window.from}–{d.window.to} NY)</>}
        </span>
        {d.auto && <button type="button" onClick={refresh} disabled={busy} className="shrink-0 text-[10.5px] underline-offset-2 hover:underline" style={{ color: 'var(--text-faint)' }}>{busy ? 'Pulling…' : 'Refresh'}</button>}
      </div>
      {d.events.length > 0 && (
        <ul className="mt-1.5 space-y-1">
          {d.events.map((e) => (
            <li key={e.id} className="flex items-center gap-2">
              <span className="size-2 rounded-full" style={{ background: e.impact === 'High' ? 'rgb(var(--outcome-loss))' : 'rgb(var(--amber))' }} />
              <span className="tabular-nums" style={{ color: 'var(--text-faint)' }}>{e.at.slice(11, 16)} <span className="text-[10.5px]">({ny(e.at)})</span></span>
              <b className="font-medium">{e.title}</b>
              {figuresLine(e) && <span className="ml-auto shrink-0 tabular-nums text-[11px]" style={{ color: 'var(--text-dim)' }} data-news-figures>{figuresLine(e)}</span>}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1.5 text-[10.5px]" style={{ color: d.error ? 'rgb(var(--outcome-loss))' : 'var(--text-faint)' }}>
        {d.error ?? (d.auto ? (d.syncedAt ? `From ForexFactory, pulled ${new Date(d.syncedAt).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}.` : 'From ForexFactory.') : 'ForexFactory pull is off — Analytics → News.')}
        {review?.news ? ` Morning check-in said: ${review.news === 'None' ? 'nothing major' : review.news.toLowerCase()}.` : ''}
      </p>
    </div>
  );
}

/** A written answer: saved as you type (the prep saves a beat after the last change). */
function TextAnswer({ value, placeholder, long, label, onChange }: { value: string; placeholder?: string; long?: boolean; label: string; onChange: (v: string) => void }) {
  const common = {
    value, placeholder, 'aria-label': label, maxLength: 400,
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value),
    className: 'w-full rounded-[calc(12px*var(--rk))] border bg-transparent px-3 py-2 text-[13px] leading-snug outline-none transition-colors focus:border-[rgb(var(--accent)/0.6)]',
    style: { borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' } as React.CSSProperties,
  };
  // Grows with what you write (field-sizing), so a long trigger or target is read whole, not cut at the edge.
  return <textarea rows={1} {...common} className={`${common.className} resize-none`}
    style={{ ...common.style, fieldSizing: 'content', minHeight: long ? '3.6em' : undefined } as React.CSSProperties} />;
}

/** What an older prep had written where the taps are now: shown, never asked again. */
function Written({ answers, keys }: { answers: PrepData['answers']; keys: string[] }) {
  const lines = keys.map((k) => answers[k]).filter((v): v is string => typeof v === 'string' && v.trim() !== '');
  if (!lines.length) return null;
  return (
    <p className="text-[11.5px] leading-snug" style={{ color: 'var(--text-faint)' }} data-prep-written>
      Written before: <span style={{ color: 'var(--text-dim)' }}>{lines.join(' · ')}</span>
    </p>
  );
}

/** A rule to keep, shown where it applies. */
function Rule({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-[calc(12px*var(--rk))] border px-3 py-2 text-[12.5px] leading-snug" data-prep-rule
      style={{ borderColor: 'rgb(var(--amber) / 0.45)', background: 'rgb(var(--amber) / 0.08)', color: 'var(--text)' }}>{children}</p>
  );
}

type FieldFn = (id: string, extra?: Partial<Parameters<typeof FieldView>[0]>) => React.ReactNode;

/** "4H/1H bias is ___ because ___. Invalidated by a 1H body close beyond ___." — or, honestly, neutral. */
function HtfSentence({ data, field }: { data: PrepData; field: FieldFn }) {
  const neutral = data.answers['htf.bias'] === 'Neutral';
  const line = biasSentence(data.answers);
  return (
    <div className="space-y-4" data-htf-sentence>
      {field('bias')}
      {neutral ? (
        <Rule>No bias you can state honestly: <b>neutral, A+ only</b>. Both scenarios below can only be taken as A+ setups today.</Rule>
      ) : <>
        {field('reasons')}
        {field('invAt')}
        <Written answers={data.answers} keys={['htf.because', 'htf.inv']} />
      </>}
      {line && <p className="text-[12.5px] italic leading-snug" style={{ color: 'var(--text-dim)' }} data-bias-line>“{line}”</p>}
      {!neutral && <p className="text-[11.5px]" style={{ color: 'var(--text-faint)' }}>Can’t fill it in honestly? Choose Neutral: A+ only.</p>}
    </div>
  );
}

/** Scenario A (with the bias) and B (the alternate), written the same way every day, then C: neither. */
function Plans({ data, field }: { data: PrepData; field: FieldFn }) {
  const checks = planChecks(data.answers);
  const card = (k: 'a' | 'b') => {
    const ceiling = gradeCeiling(data.answers, k);
    return (
      <div className="space-y-3 rounded-[calc(14px*var(--rk))] border p-3" style={{ borderColor: 'var(--glass-stroke)' }} data-scenario={k}>
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[12px] font-semibold">{k === 'a' ? 'Scenario A · primary, with the bias' : 'Scenario B · the alternate'}</p>
          {ceiling && <span className="shrink-0 rounded-full border px-2 py-px text-[10.5px] font-semibold" data-ceiling
            style={ceiling.startsWith('Can') ? { borderColor: 'rgb(var(--accent) / 0.45)', color: 'rgb(var(--accent))' } : { borderColor: 'rgb(var(--amber) / 0.5)', color: 'rgb(var(--amber))' }}>{ceiling}</span>}
        </div>
        {field(`${k}Dir`)}
        {/* A long waits below price and aims above; a short the other way round. */}
        {field(`${k}Zones`, { hide: notOffered(data.answers, k, 'zone') })}
        {field(`${k}Confirms`)}
        {field(`${k}Target`)}
        {field(`${k}TargetAt`, { hide: notOffered(data.answers, k, 'target') })}
        {field(`${k}RR`)}
        {field(`${k}Kills`)}
        <Written answers={data.answers} keys={['Story', 'TriggerNote', 'Confirm', 'TargetNote', 'Kill'].map((f) => `plans.${k}${f}`)} />
      </div>
    );
  };
  return (
    <div className="space-y-4" data-plans>
      {(() => {
        const taken = takenOf(data.answers);
        const noNews = data.answers['session.news'] === 'None today';
        const bias = data.answers['htf.bias'];
        const parts = [
          taken.length ? <>run overnight, so not offered: <b>{taken.join(', ')}</b></> : null,
          noNews ? <>no news today, so no data wick</> : null,
          bias === 'Bullish' || bias === 'Bearish' ? <>A goes with your {String(bias).toLowerCase()} bias, B the other way</> : null,
        ].filter(Boolean);
        return parts.length ? (
          <p className="text-[11.5px] leading-snug" style={{ color: 'var(--text-faint)' }} data-plans-auto>
            From your earlier answers: {parts.map((p, i) => <span key={i}>{i > 0 && ' · '}{p}</span>)}.
          </p>
        ) : null;
      })()}
      <div className="grid gap-3 sm:grid-cols-2">{card('a')}{card('b')}</div>
      {checks.length > 0 && (
        <ul className="space-y-1.5" data-plan-checks>
          {checks.map((c) => (
            <li key={c.text} className="rounded-[calc(10px*var(--rk))] px-3 py-1.5 text-[12px] leading-snug"
              style={{ background: c.level === 'warn' ? 'rgb(var(--amber) / 0.1)' : 'var(--glass-fill)', color: c.level === 'warn' ? 'var(--text)' : 'var(--text-dim)' }}>{c.text}</li>
          ))}
        </ul>
      )}
      <div className="space-y-3 rounded-[calc(14px*var(--rk))] border p-3" style={{ borderColor: 'var(--glass-stroke)' }} data-scenario="c">
        <p className="text-[12px] font-semibold">Scenario C · neither</p>
        {field('cutoffAt')}
        <Written answers={data.answers} keys={['plans.cutoff']} />
        <p className="text-[12.5px] leading-snug" data-scenario-c-line>{scenarioC(data.answers)} Written down, so “no trade” counts as following the plan.</p>
        {field('stop')}
      </div>
    </div>
  );
}
