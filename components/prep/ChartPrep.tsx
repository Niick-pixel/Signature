'use client';
import { localizeNy, localOpen, nyToLocal } from '@/lib/localTime';

import { CONFIRM_RULE } from '@/lib/replay';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { localDay } from '@/lib/day';
import { press, spring, springSoft } from '@/lib/motion';
import {
  EMPTY_PREP, PREP_STEPS, TAKEN_KEY, WAIT_KEY, answerKey, answerText, biasSentence, deriveDecisions, gradeCeiling, liveMarks,
  overnightRead, planChecks, planSummary, prepProgress, scenarioC, stepsOf, withWeeklyTaken, notOffered, takenOf, tidyPlans,
  type Answer, type PrepData, type PrepField, type PrepStep, type SessionPrep,
} from '@/lib/prep';
import type { DailyReview } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { usePreferences } from '@/components/shell/PreferencesProvider';
import { figuresLine } from '@/lib/news';

export const PREP_SAVED = 'signature:prep';

/** Minutes until the cash open (9:30 in New York, shown on your clock), today — negative once it has opened. */
function minutesToOpen(now = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24;
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return 9 * 60 + 30 - (h * 60 + m);
}
function openLine(mins: number): string {
  if (mins > 0) return `The open (${localOpen()}) in ${mins >= 60 ? `${Math.floor(mins / 60)}h ` : ''}${mins % 60}m`;
  if (mins > -150) return 'The market is open — a late prep, and that is worth knowing';
  return 'After the session';
}

/**
 * The chart half of the check-in, as the backtest plan builder is laid out:
 * two pages in one window that never changes size and never scrolls.
 *
 *  1. Read the chart — news, the HTF bias sentence and what was run overnight
 *     side by side, the location, then the liquidity map above and below.
 *  2. Two plans, and C — A and B side by side, each question beside its twin,
 *     then C (the cutoff and the stop) in one strip.
 *
 * Every answer is a tap. Saved as it goes; a page can be skipped; the dots at
 * the top jump. Progress is still kept per step (news, htf, overnight, map,
 * location, plans): a page marks the steps on it.
 */
const PAGES = [
  { id: 'read', title: 'Read the chart', frames: '4H · 1H · 15m', steps: ['news', 'htf', 'overnight', 'location', 'map'] },
  { id: 'plan', title: 'Two plans, and C', frames: 'NY AM', steps: ['plans'] },
] as const;
const pageDone = (d: PrepData, i: number) => PAGES[i].steps.every((s) => d.steps[s]);

export function ChartPrep({ review, onClose, onFinished }: {
  review: DailyReview | null; onClose: () => void;
  /** The last page marked: the window shrinks to the summary (MorningCheckIn), which closes itself. */
  onFinished?: (finished: boolean) => void;
}) {
  const [day] = useState(() => localDay());
  const [data, setData] = useState<PrepData | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [at, setAt] = useState(0);
  const [finished, setFinished] = useState(false);
  useEffect(() => { onFinished?.(finished); }, [finished, onFinished]);
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
      const first = PAGES.findIndex((_, i) => !pageDone(d, i));
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

  if (!data) return <div className="grid flex-1 place-items-center text-[12px]" style={{ color: 'var(--text-faint)' }}>Opening the chart prep…</div>;

  const page = PAGES[at];
  const progress = prepProgress(data);

  const mark = (state: 'done' | 'skipped') => {
    const next = structuredClone(data);
    for (const id of page.steps) if (!next.steps[id] || state === 'done') next.steps[id] = state;
    touched.current = true;
    setData(next);
    const after = PAGES.findIndex((_, i) => i > at && !pageDone(next, i));
    const any = PAGES.findIndex((_, i) => !pageDone(next, i));
    if (after !== -1) setAt(after);
    else if (any !== -1) setAt(any);
    else { setFinished(true); void save(next, true); }
  };

  return (
    <div data-chart-prep className="flex min-h-0 flex-1 flex-col">
      {/* Where you are: one dot per page, each a jump. */}
      {!finished && <div className="mb-3 flex items-center gap-1.5" role="tablist" aria-label="Chart prep pages">
        {PAGES.map((pg, i) => {
          const done = pageDone(data, i);
          const skipped = done && pg.steps.every((s) => data.steps[s] === 'skipped');
          const here = i === at && !finished;
          return (
            <motion.button key={pg.id} type="button" role="tab" aria-selected={here} title={pg.title}
              data-prep-dot={pg.id} data-state={skipped ? 'skipped' : done ? 'done' : 'open'}
              onClick={() => { setFinished(false); setAt(i); }}
              className="h-1.5 rounded-full" initial={false}
              animate={{
                flexGrow: here ? 3 : 1,
                background: skipped ? 'var(--text-faint)' : done ? 'rgb(var(--outcome-win))' : here ? 'rgb(var(--accent))' : 'var(--glass-stroke)',
                opacity: skipped ? 0.45 : 1,
              }}
              transition={springSoft} style={{ flexBasis: 0 }} />
          );
        })}
      </div>}

      <AnimatePresence mode="wait" initial={false}>
        {finished ? (
          <motion.div key="ready" className="flex min-h-0 flex-1 flex-col" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }} transition={springSoft}>
            <Ready data={data} startedAt={startedAt} onClose={onClose} />
          </motion.div>
        ) : (
          <motion.div key={page.id} data-prep-current={page.id} className="flex min-h-0 flex-1 flex-col"
            initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8, transition: { duration: 0.12 } }} transition={springSoft}>
            <PageHead index={at} page={page} heatmap={page.id === 'read'} note={page.id === 'plan' ? <PlansAuto data={data} /> : null} />
            <div className="mt-2.5 flex min-h-0 flex-1 flex-col">
              {page.id === 'read'
                ? <ReadPage data={data} change={change} review={review} carried={carried} />
                : <PlanPage data={data} change={change} />}
            </div>
            <div className="mt-2.5 flex items-center gap-3 border-t pt-2.5" style={{ borderColor: 'var(--glass-stroke)' }}>
              {at > 0 && <Button onClick={() => setAt(at - 1)}>Back</Button>}
              <span className="shrink-0 text-[10.5px] tabular-nums" style={{ color: 'var(--text-faint)' }}>
                {progress.answered}/{progress.total}{saved ? ' · saved' : ''}
                <span data-open-countdown className="block" style={{ color: mins > 0 ? 'var(--text-faint)' : 'rgb(var(--amber))' }}>{openLine(mins)}</span>
              </span>
              {/* The plan's own checks (a kill switch missing, both scenarios the same way…), where they never push the page. */}
              <div className="min-w-0 flex-1">{page.id === 'plan' && <PlanChecks data={data} />}</div>
              <div className="flex shrink-0 gap-2">
                <Button onClick={() => mark('skipped')}>Skip</Button>
                <Button variant="primary" data-prep-next onClick={() => mark('done')}>
                  {at === PAGES.length - 1 ? 'Finish' : 'Next'}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PageHead({ index, page, heatmap, note }: { index: number; page: (typeof PAGES)[number]; heatmap: boolean; note?: React.ReactNode }) {
  const { prefs } = usePreferences();
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="flex min-w-0 items-baseline gap-2.5">
        <h3 className="shrink-0 text-[18px] font-semibold tracking-tight">{page.title}</h3>
        <span className="shrink-0 text-[10.5px] font-medium uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>Step {index + 1} of {PAGES.length} · {page.frames}</span>
        {note}
      </div>
      {heatmap && prefs.heatmapUrl && (
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
  );
}

type Change = (fn: (d: PrepData) => PrepData) => void;

/** One answer setter for every step, as the six-step prep had per step: the plans follow what is answered. */
function useFields(data: PrepData, change: Change) {
  const stepOf = (id: string) => PREP_STEPS.find((x) => x.id === id)!;
  const setAnswer = (step: PrepStep, field: PrepField, value: Answer | null) => change((d) => {
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
  /** `field('htf', 'bias')`: the field, its answer and its setter. */
  const field = (stepId: string, id: string, extra: Partial<Parameters<typeof FieldView>[0]> = {}) => {
    const step = stepOf(stepId); const f = step.fields.find((x) => x.id === id)!;
    return <FieldView key={`${stepId}.${id}`} field={f} value={data.answers[answerKey(step, f)]} onChange={(v) => setAnswer(step, f, v)} {...extra} />;
  };
  const toggleMark = (stepId: string, i: number) => change((d) => {
    const cur = new Set(d.ticks[stepId] ?? []);
    if (cur.has(i)) cur.delete(i); else cur.add(i);
    d.ticks[stepId] = [...cur].sort();
    return d;
  });
  return { field, setAnswer, stepOf, toggleMark };
}

const card = 'rounded-[calc(18px*var(--rk))] border p-3';
const cardStyle = { borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' } as const;
const Heading = ({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) => (
  <div className="flex items-baseline justify-between gap-2 px-1">
    <span className="text-[13px] font-semibold">{children}</span>{right}
  </div>
);

/** Page 1: news, the bias and the overnight run side by side; the location; then the map, above and below. */
function ReadPage({ data, change, review, carried }: { data: PrepData; change: Change; review: DailyReview | null; carried: Array<{ level: string; day: string }> }) {
  const { field, setAnswer, stepOf } = useFields(data, change);
  const news = stepOf('news');
  const r = overnightRead(data.answers);
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-between gap-3">
      {/* The bias (and where price sits) on the left; the news and the overnight run stacked beside it. */}
      <div className="grid gap-3 lg:grid-cols-[1.55fr_1fr]">
        <div className={`${card} flex flex-col gap-1.5`} style={cardStyle} data-prep-section="htf">
          <Heading>HTF bias</Heading>
          <HtfSentence data={data} field={(id, extra) => field('htf', id, extra)} location={field('location', 'zone')} />
        </div>
        <div className="flex flex-col gap-3">
          <div className={`${card} flex flex-col gap-1.5`} style={cardStyle} data-prep-section="news">
            <Heading>News</Heading>
            {field('news', 'news')}
            <SessionNews review={review} answered={data.answers['session.news'] != null} onAnswer={(v) => setAnswer(news, news.fields.find((x) => x.id === 'news')!, v)} />
            {data.answers['session.news'] === 'Inside the killzone' && (
              <Rule>Red folder in the killzone: no position through it — trade off the release candle’s range.</Rule>
            )}
          </div>
          <div className={`${card} flex flex-1 flex-col gap-1.5`} style={cardStyle} data-prep-section="overnight">
            <Heading>Taken overnight</Heading>
            {field('overnight', 'taken', { notes: Object.fromEntries(carried.map((c) => [c.level, `since ${weekday(c.day)}`])) })}
            <div className="mt-auto px-1 text-[12px]" data-overnight-read>
              <p><span style={{ color: 'var(--text-faint)' }}>Still there: </span><b className="font-medium">{r.stillThere.join(', ') || 'nothing — every level was run'}</b></p>
              {r.line && <p className="mt-0.5" style={{ color: 'var(--text-dim)' }}>{r.line}</p>}
            </div>
          </div>
        </div>
      </div>
      {/* The liquidity map: the nearest named level each way, and what stands between price and it. */}
      <div className="grid gap-3 lg:grid-cols-2">
        {(['above', 'below'] as const).map((side) => (
          <div key={side} className={`${card} flex flex-col gap-1.5`} style={cardStyle} data-map-side={side}>
            <Heading>{side === 'above' ? 'Above price' : 'Below price'}</Heading>
            {field('map', side, { hide: takenOf(data.answers) })}
            {/* Three short questions side by side, each label above its taps: one row, not two, however the levels above wrap. */}
            <div className="grid gap-x-2 gap-y-1.5 xl:grid-cols-[auto_auto_minmax(0,1fr)]">
              {field('map', `${side}Tier`, { inline: false })}
              {field('map', `${side}State`, { inline: false })}
              {field('map', side === 'above' ? 'gapAbove' : 'gapBelow', { inline: false })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const weekday = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' });

const TONE: Record<string, string> = {
  Uptrend: 'var(--outcome-win)', Up: 'var(--outcome-win)', 'Longs only': 'var(--outcome-win)', Discount: 'var(--outcome-win)', Bullish: 'var(--outcome-win)', Long: 'var(--outcome-win)',
  Downtrend: 'var(--outcome-loss)', Down: 'var(--outcome-loss)', 'Shorts only': 'var(--outcome-loss)', Premium: 'var(--outcome-loss)', Bearish: 'var(--outcome-loss)', Short: 'var(--outcome-loss)',
  'No trade today': 'var(--amber)', 'Coin flip': 'var(--amber)', 'Being pulled': 'var(--amber)', 'Thin book': 'var(--amber)', '<1.5': 'var(--outcome-loss)',
};

/**
 * One question: its label and its options as taps, in the builder's glass group. One answer, or any that
 * apply ('many', with a cap where it has one). No dropdowns: a pick is a tap like the rest.
 */
function FieldView({ field, value, onChange, hide = [], notes = {}, inline = true }: {
  field: PrepField; value: Answer | undefined; onChange: (v: Answer | null) => void;
  /** The label beside the taps (the default: a line saved per question, so nothing scrolls); false: above them. */
  inline?: boolean;
  /** Options not offered (a level already taken, on the wrong side). */
  hide?: readonly string[];
  /** A short note per option, e.g. "since Mon" on a weekly level carried in. */
  notes?: Record<string, string>;
}) {
  return (
    <div data-prep-field={field.id} role="group" aria-label={field.label} className={inline ? 'grid grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-2' : undefined}>
      <span className={`${inline ? 'pt-[9px] leading-tight' : 'mb-1'} block px-1 text-[10px] font-medium uppercase tracking-[0.07em]`} style={{ color: 'var(--text-faint)' }}>
        {field.label}{field.kind === 'many' ? (field.max ? '' : ' · any') : ''}
        {field.hint && <span title={field.hint} className="ml-1 cursor-help normal-case" aria-label={field.hint}>ⓘ</span>}
      </span>
      {field.kind === 'text' ? (
        <TextAnswer value={typeof value === 'string' ? value : ''} placeholder={field.placeholder} long={field.long} label={field.label} onChange={(v) => onChange(v.trim() ? v : null)} />
      ) : (
        <div className="glass flex flex-wrap gap-0.5 rounded-[calc(14px*var(--rk))] p-1">
          {field.options.filter((o) => !hide.includes(o) || o === value).map((o) => {
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
                  background: on ? `rgb(${tone} / 0.14)` : 'rgb(0 0 0 / 0)',
                  color: on ? `rgb(${tone})` : 'var(--text-dim)',
                  boxShadow: on ? `inset 0 0 0 1px rgb(${tone} / 0.4)` : 'inset 0 0 0 1px rgb(0 0 0 / 0)',
                }}
                transition={spring}
                className="flex-[1_0_auto] whitespace-nowrap rounded-[calc(10px*var(--rk))] px-2.5 py-1 text-[11.5px] font-medium">
                {field.clock === 'ny' ? localizeNy(o) : o}
                {notes[o] && on && <span className="ml-1.5 text-[10px] font-normal opacity-70" data-carried={o}>{notes[o]}</span>}
              </motion.button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** How long the summary stays before the window closes itself. */
export const READY_MS = 8000;

/**
 * The end, small: the answers in one place to glance at, no buttons. A bar empties from full and the window
 * closes when it reaches nothing; the pointer over it holds it (to read), Esc closes at once.
 */
function Ready({ data, startedAt, onClose }: { data: PrepData; startedAt: string | null; onClose: () => void }) {
  const p = prepProgress(data);
  // The bar is a CSS animation on the compositor (scaleX), never a re-render per frame: smooth on any machine.
  // Held, it pauses where it is; the seconds under it are only the label, counted while it runs.
  const [held, setHeld] = useState(false);
  const [left, setLeft] = useState(READY_MS);
  useEffect(() => {
    if (held) return;
    let last = performance.now();
    const id = window.setInterval(() => { const now = performance.now(); setLeft((l) => Math.max(0, l - (now - last))); last = now; }, 250);
    return () => window.clearInterval(id);
  }, [held]);
  // The new prep ends on its plan (bias, A, B, C); an older one lists its answers.
  const rows = stepsOf(data) === PREP_STEPS ? planSummary(data.answers).map((r) => [r.label, r.value] as const)
    : stepsOf(data).flatMap((s) => s.fields.map((f) => [f.label, answerText(data.answers[answerKey(s, f)])] as const)).filter(([, v]) => v != null);
  return (
    <div data-prep-ready onMouseEnter={() => setHeld(true)} onMouseLeave={() => setHeld(false)}>
      <div className="flex items-center gap-3">
        <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={springSoft}
          className="grid size-10 shrink-0 place-items-center rounded-full"
          style={{ background: 'rgb(var(--outcome-win) / 0.14)', color: 'rgb(var(--outcome-win))' }}>
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path d="M5 10.5l3.2 3.2L15 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </motion.span>
        <div>
          <h3 className="text-[19px] font-semibold tracking-tight">Ready for the open</h3>
          <p className="text-[11.5px]" style={{ color: 'var(--text-dim)' }}>
            {p.done} of {p.total} marked{p.answered > p.done ? `, ${p.answered - p.done} skipped` : ''}
            {startedAt ? ` · started ${new Date(startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
          </p>
        </div>
      </div>
      {rows.length > 0 && (
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[12.5px]" data-prep-plan>
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt style={{ color: 'var(--text-faint)' }}>{k}</dt>
              <dd className="font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {/* Emptying from full: when it reaches nothing, the window closes. */}
      <div className="mt-5 h-1 overflow-hidden rounded-full" style={{ background: 'var(--glass-stroke)' }} title={held ? 'Held while the pointer is here' : 'Closes by itself'}>
        <div className="h-full w-full origin-left rounded-full will-change-transform" data-prep-countdown={Math.ceil(left / 1000)}
          onAnimationEnd={onClose}
          style={{
            animation: `prep-countdown ${READY_MS}ms linear forwards`, animationPlayState: held ? 'paused' : 'running',
            background: held ? 'var(--text-faint)' : 'rgb(var(--outcome-win))', transition: 'background 200ms',
          }} />
      </div>
      <p className="mt-1.5 text-[10.5px]" style={{ color: 'var(--text-faint)' }}>{held ? 'Held — move away to let it close.' : `Closes in ${Math.ceil(left / 1000)}s · Esc closes now`}</p>
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
  if (!d) return <p className="mt-2 text-[12px]" style={{ color: 'var(--text-faint)' }}>Reading the calendar…</p>;
  return (
    <div className="mt-1 rounded-[calc(12px*var(--rk))] border px-3 py-1.5 text-[12px] [contain:inline-size]" style={{ borderColor: 'var(--glass-stroke)' }} data-session-news={d.events.length}>
      <div className="flex items-baseline justify-between gap-2">
        {/* Two lines, always, news or not: this one (the releases, or that there are none) and where it came from. */}
        {d.events.length ? (() => {
          const e = d.events[0];
          return (
            <span className="flex min-w-0 items-center gap-2" data-session-news-list
              title={d.events.map((x) => `${x.at.slice(11, 16)} ${x.title}${figuresLine(x) ? ` · ${figuresLine(x)}` : ''}`).join('\n')}>
              <span className="size-2 shrink-0 rounded-full" style={{ background: e.impact === 'High' ? 'rgb(var(--outcome-loss))' : 'rgb(var(--amber))' }} />
              <span className="shrink-0 tabular-nums" style={{ color: 'var(--text-faint)' }}>{e.at.slice(11, 16)}</span>
              <b className="min-w-0 truncate font-medium">{e.title}{figuresLine(e) ? <span className="font-normal tabular-nums" style={{ color: 'var(--text-dim)' }} data-news-figures> · {figuresLine(e)}</span> : null}</b>
              {d.events.length > 1 && <span className="shrink-0 text-[11px]" style={{ color: 'var(--text-dim)' }} data-news-more>+{d.events.length - 1} more</span>}
              <span className="min-w-0 truncate text-[11px]" style={{ color: 'var(--text-faint)' }}>· your session {nyToLocal(d.window.from)}–{nyToLocal(d.window.to)}, {d.currencies.join('/')}</span>
            </span>
          );
        })() : (
          <span className="min-w-0 truncate" style={{ color: 'var(--text-dim)' }}>No red or orange {d.currencies.join('/')} news in your session ({nyToLocal(d.window.from)}–{nyToLocal(d.window.to)})</span>
        )}
        {d.auto && <button type="button" onClick={refresh} disabled={busy} className="shrink-0 text-[10.5px] underline-offset-2 hover:underline" style={{ color: 'var(--text-faint)' }}>{busy ? 'Pulling…' : 'Refresh'}</button>}
      </div>
      <p className="mt-0.5 truncate text-[10.5px] leading-tight" style={{ color: d.error ? 'rgb(var(--outcome-loss))' : 'var(--text-faint)' }}>
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
    <p className="rounded-[calc(10px*var(--rk))] border px-2.5 py-1 text-[11.5px] leading-snug" data-prep-rule
      style={{ borderColor: 'rgb(var(--amber) / 0.45)', background: 'rgb(var(--amber) / 0.08)', color: 'var(--text)' }}>{children}</p>
  );
}

type FieldFn = (id: string, extra?: Partial<Parameters<typeof FieldView>[0]>) => React.ReactNode;

/** "4H/1H bias is ___ because ___. Invalidated by a 1H body close beyond ___." — or, honestly, neutral. */
function HtfSentence({ data, field, location }: { data: PrepData; field: FieldFn; location?: React.ReactNode }) {
  const neutral = data.answers['htf.bias'] === 'Neutral';
  const line = biasSentence(data.answers);
  return (
    <div className="flex flex-1 flex-col gap-2" data-htf-sentence>
      {field('bias')}
      {neutral ? (
        <Rule>No bias you can state honestly: <b>neutral, A+ only</b>. Both scenarios can only be taken as A+ setups today.</Rule>
      ) : <>
        {field('reasons')}
        {field('invAt')}
        <Written answers={data.answers} keys={['htf.because', 'htf.inv']} />
      </>}
      {location}
      <p className="mt-auto px-1 text-[12px] italic leading-snug" style={{ color: line ? 'var(--text-dim)' : 'var(--text-faint)' }} data-bias-line>
        {line ? `“${line}”` : 'Can’t fill it in honestly? Choose Neutral: A+ only.'}
      </p>
    </div>
  );
}

const PLAN_ROWS = ['DirRR', 'Zones', 'Target', 'TargetAt', 'Kills'] as const;

/**
 * Page 2: Scenario A (with the bias) and B (the alternate) side by side, on rows they share — each question
 * beside its twin, as in the backtest builder — then C (neither: the cutoff, the stop) and the marks in a strip.
 */
function PlanPage({ data, change }: { data: PrepData; change: Change }) {
  const { field, stepOf, toggleMark } = useFields(data, change);
  const f = (id: string, extra: Partial<Parameters<typeof FieldView>[0]> = {}) => field('plans', id, extra);
  const plans = stepOf('plans');
  const ticks = data.ticks.plans ?? [];
  const col = (k: 'a' | 'b') => {
    const ceiling = gradeCeiling(data.answers, k);
    return (
      <div className={`${card} row-span-6 grid grid-rows-subgrid gap-y-1.5`} style={cardStyle} data-scenario={k}>
        <div>
          <Heading right={ceiling && <span className="shrink-0 rounded-full border px-2 py-px text-[10.5px] font-semibold" data-ceiling
            style={ceiling.startsWith('Can') ? { borderColor: 'rgb(var(--accent) / 0.45)', color: 'rgb(var(--accent))' } : { borderColor: 'rgb(var(--amber) / 0.5)', color: 'rgb(var(--amber))' }}>{ceiling}</span>}>
            {k === 'a' ? 'Scenario A · with the bias' : 'Scenario B · the alternate'}
          </Heading>
          <Written answers={data.answers} keys={['Story', 'TriggerNote', 'Confirm', 'TargetNote', 'Kill'].map((x) => `plans.${k}${x}`)} />
        </div>
        {PLAN_ROWS.map((row) => row === 'DirRR' ? (
          // Two short questions on one row, labels above: the direction and the rough R.
          <div key={row} className="grid gap-x-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">{f(`${k}Dir`, { inline: false })}{f(`${k}RR`, { inline: false })}</div>
        ) : (
          <div key={row}>{f(`${k}${row}`, row === 'Zones' ? { hide: notOffered(data.answers, k, 'zone') } : row === 'TargetAt' ? { hide: notOffered(data.answers, k, 'target') } : {})}</div>
        ))}
      </div>
    );
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-between gap-2.5" data-plans>
      <div className="grid grid-rows-[repeat(6,auto)] gap-x-3 lg:grid-cols-2">{col('a')}{col('b')}</div>
      {/* C, the stop and the marks: one strip. */}
      <div className={`${card} grid items-end gap-x-4 gap-y-2 lg:grid-cols-[1.5fr_auto_auto_1fr]`} style={cardStyle} data-scenario="c">
        <div className="self-center px-1">
          <span className="text-[13px] font-semibold" title="Written down, so “no trade” counts as following the plan.">Scenario C</span>
          <p className="text-[12px] leading-snug" data-scenario-c-line>{scenarioC(data.answers)}</p>
          <Written answers={data.answers} keys={['plans.cutoff']} />
          {/* The confirmation is the strategy, the same for A and B every day: read here, never picked (as the backtest plan). */}
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 rounded-[calc(10px*var(--rk))] border border-dashed px-2.5 py-1 text-[11.5px]" data-confirm-info="prep"
            title="Not picked: the model confirms the same way every day." style={{ borderColor: 'var(--glass-stroke)', background: 'rgb(var(--accent) / 0.03)' }}>
            <span className="self-center rounded-[5px] px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.08em]" style={{ color: 'rgb(var(--accent))', background: 'rgb(var(--accent) / 0.12)' }}>rule</span>
            <span style={{ color: 'var(--text-faint)' }}>Confirmation, A and B:</span>
            <b className="font-semibold">{CONFIRM_RULE.trigger}</b>
            <span style={{ color: 'var(--text-dim)' }}>· extra: {CONFIRM_RULE.extra}</span>
          </div>
        </div>
        {f('cutoffAt', { inline: false })}
        {f('stop', { inline: false })}
        <div className="flex flex-col gap-1" data-plan-marks>
          {liveMarks(plans).map(({ text, i }) => {
            const on = ticks.includes(i);
            return (
              <motion.button key={i} type="button" role="checkbox" aria-checked={on} data-mark={i} onClick={() => toggleMark('plans', i)} whileTap={press}
                animate={{ borderColor: on ? 'rgb(var(--outcome-win) / 0.45)' : 'var(--glass-stroke)', background: on ? 'rgb(var(--outcome-win) / 0.08)' : 'rgb(0 0 0 / 0)' }}
                transition={spring} className="flex items-center gap-2 rounded-[calc(10px*var(--rk))] border px-2.5 py-[5px] text-left text-[11.5px]">
                <span className="grid size-[14px] shrink-0 place-items-center rounded-[calc(4px*var(--rk))]" style={{ background: on ? 'rgb(var(--outcome-win) / 0.2)' : 'var(--glass-fill-strong)', color: 'rgb(var(--outcome-win))' }}>{on ? '✓' : ''}</span>
                <span style={{ color: on ? 'var(--text-dim)' : 'var(--text)' }}>{text}</span>
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** What the plans took from the earlier answers, beside the page title. */
function PlansAuto({ data }: { data: PrepData }) {
  const taken = takenOf(data.answers);
  const bias = data.answers['htf.bias'];
  const auto = [
    taken.length ? <>run overnight, so not offered: <b>{taken.join(', ')}</b></> : null,
    data.answers['session.news'] === 'None today' ? <>no news today, so no data wick</> : null,
    bias === 'Bullish' || bias === 'Bearish' ? <>A goes with your {String(bias).toLowerCase()} bias, B the other way</> : null,
  ].filter(Boolean);
  if (!auto.length) return null;
  return (
    <p className="min-w-0 truncate text-[11.5px]" style={{ color: 'var(--text-faint)' }} data-plans-auto>
      From your earlier answers: {auto.map((x, i) => <span key={i}>{i > 0 && ' · '}{x}</span>)}.
    </p>
  );
}

/** The plan's checks, in the footer: amber for a rule left out, plain for a note. */
function PlanChecks({ data }: { data: PrepData }) {
  const checks = planChecks(data.answers);
  if (!checks.length) return null;
  return (
    <ul className="flex flex-wrap gap-1" data-plan-checks>
      {checks.map((c) => (
        <li key={c.text} className="rounded-full px-2.5 py-0.5 text-[11px] leading-snug"
          style={{ background: c.level === 'warn' ? 'rgb(var(--amber) / 0.12)' : 'var(--glass-fill)', color: c.level === 'warn' ? 'var(--text)' : 'var(--text-dim)' }}>{c.text}</li>
      ))}
    </ul>
  );
}
