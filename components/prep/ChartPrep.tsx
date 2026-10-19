'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { localDay } from '@/lib/day';
import { press, spring, springSoft } from '@/lib/motion';
import {
  EMPTY_PREP, PREP_STEPS, TAKEN_KEY, WAIT_KEY, answerKey, answerText, prepProgress, withWeeklyTaken,
  type Answer, type PrepData, type PrepField, type PrepStep, type SessionPrep,
} from '@/lib/prep';
import type { DailyReview } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { usePreferences } from '@/components/shell/PreferencesProvider';

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
 * The chart half of the check-in: six short steps, one at a time, in the same
 * window. Each is a few marks to tick as they go on the chart and a few
 * answers to tap — nothing to type. Saved as it goes; any step can be
 * skipped; the dots at the top jump anywhere.
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
                  {at === PREP_STEPS.length - 1 ? 'Finish' : 'Marked — next'}
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
    return d;
  });

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

      {step.id === 'session' && (
        <p className="mt-2 text-[12px]" style={{ color: 'var(--text-dim)' }}>
          {review?.news
            ? <>News today: <strong>{review.news === 'None' ? 'nothing major' : review.news.toLowerCase()}</strong>{review.news_note ? ` — ${review.news_note}` : ''}</>
            : 'No news noted in the morning.'}
        </p>
      )}

      {/* The marks — ticked as each goes on the chart. */}
      <div className="mt-4 space-y-1.5">
        {step.marks.map((m, i) => {
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

      {/* The answers — taps, not typing. */}
      {step.fields.length > 0 && (
        <div className="mt-5 space-y-4">
          {step.fields.map((f) => (
            <FieldView key={f.id} field={f} value={data.answers[answerKey(step, f)]} onChange={(v) => setAnswer(f, v)}
              // A level already taken is not one to wait for.
              hide={answerKey(step, f) === WAIT_KEY ? (Array.isArray(data.answers[TAKEN_KEY]) ? data.answers[TAKEN_KEY] as string[] : []) : []}
              notes={answerKey(step, f) === TAKEN_KEY ? Object.fromEntries(carried.map((c) => [c.level, `since ${weekday(c.day)}`])) : {}} />
          ))}
        </div>
      )}
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
        {field.label}{field.kind === 'many' ? ' — any that apply' : ''}
      </span>
      {field.kind === 'pick' ? (
        <div className="max-w-[16rem]">
          <Select value={typeof value === 'string' ? value : null} onChange={(v) => onChange(v)} options={field.options} placeholder="Choose…" />
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
                    onChange(on ? cur.filter((x) => x !== o) : [...cur, o]);
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
  const rows = PREP_STEPS.flatMap((s) => s.fields.map((f) => [f.label, answerText(data.answers[answerKey(s, f)])] as const))
    .filter(([, v]) => v != null);
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
        <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[12.5px]">
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
