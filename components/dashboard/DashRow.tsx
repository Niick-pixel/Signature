'use client';

import { Fragment, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { usePreferences } from '@/components/shell/PreferencesProvider';
import { QuoteOfDay } from '@/components/personal/QuoteOfDay';
import { openGoals } from '@/components/goals/GoalsSheet';
import { navigate } from '@/lib/nav';
import { localDay } from '@/lib/day';
import { springSoft, stagger } from '@/lib/motion';
import { addDays, mondayOf, RINGS, type DayRings, type Streak } from '@/lib/consistency';
import { DASH_CARDS, DASH_CARD_INFO, DASH_ROW_MAX, type DashCard, type DashSlot } from '@/lib/preferences';
import type { DashboardData } from '@/lib/dashboard';
import { Card } from './Card';
import { StudyMeter } from '@/components/study/StudyMeter';
import type { StudyTotals } from '@/lib/study';
import { useLiveTick } from '@/lib/useLive';
import { figuresLine } from '@/lib/news';

const WEEKDAY = ['M', 'T', 'W', 'T', 'F'];
const faint = { color: 'var(--text-faint)' } as const;
const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-[12px]" style={faint}>{children}</p>;
const getJson = <T,>(url: string) => fetch(url).then((r) => (r.ok ? (r.json() as Promise<T>) : null)).catch(() => null);

/**
 * The Dashboard's bottom row, from your slots (Settings → Dashboard, or the
 * Cards button). Narrow slots take one share of the width, wide ones two. A
 * card with nothing to show renders nothing, and its empty slot is hidden —
 * the others widen instead of leaving a gap.
 */
export function DashRow({ slots, builtIn, d, money }: {
  slots: DashSlot[]; builtIn: Partial<Record<DashCard, React.ReactNode>>; d: DashboardData; money: boolean;
}) {
  if (!slots.length) return null;
  const render = (id: DashCard): React.ReactNode => {
    if (id in builtIn) return builtIn[id];
    switch (id) {
      case 'process': return <ProcessCard />;
      case 'study': return <StudyCard />;
      case 'goals': return <GoalsCard />;
      case 'fix': return <FixCard />;
      case 'month': return <MonthCard d={d} money={money} />;
      case 'news': return <NewsCard />;
      case 'quote': return <Card title="Today's line"><QuoteOfDay className="text-left" /></Card>;
      default: return null;
    }
  };
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch [&>*:empty]:hidden [&>*>section]:h-full" data-dash-row={slots.map((s) => s.id).join(',')}>
      {slots.map((s) => (
        <div key={s.id} className="min-w-0" style={{ flex: `${s.size} 1 0%` }} data-dash-slot={s.id}>{render(s.id)}</div>
      ))}
    </div>
  );
}

/* ───────────────────────── the editor ───────────────────────── */

/** Pick the cards, put them in order, make each narrow or wide. */
export function DashRowEditor() {
  const { prefs, update } = usePreferences();
  const row = prefs.dashRow;
  const set = (next: DashSlot[]) => update({ dashRow: next });
  const move = (i: number, by: number) => { const j = i + by; if (j < 0 || j >= row.length) return; const n = [...row]; [n[i], n[j]] = [n[j], n[i]]; set(n); };
  const unused = DASH_CARDS.filter((c) => !row.some((s) => s.id === c));
  return (
    <div className="space-y-3" data-dash-row-editor>
      <div>
        <span className="mb-1.5 block text-[11px]" style={faint}>The bottom row, left to right — up to {DASH_ROW_MAX}</span>
        {!row.length && <Empty>Empty — the row is hidden. Add a card below.</Empty>}
        <ul className="flex flex-wrap gap-2">
          {row.map((s, i) => (
            <motion.li key={s.id} layout transition={springSoft} data-dash-slot-edit={s.id}
              className="flex items-center gap-1 rounded-full border py-1 pl-3 pr-1 text-[12px]"
              style={{ borderColor: 'rgb(var(--accent) / 0.4)', background: 'rgb(var(--accent) / 0.08)' }}>
              <span className="font-medium">{DASH_CARD_INFO[s.id].label}</span>
              <button type="button" onClick={() => set(row.map((x) => (x.id === s.id ? { ...x, size: x.size === 1 ? 2 : 1 } : x)))}
                title={s.size === 1 ? 'Narrow — click for wide' : 'Wide — click for narrow'} data-dash-size={s.size}
                className="ml-1 rounded-full px-2 py-0.5 text-[10.5px]" style={{ background: 'var(--glass-fill-strong)', color: 'var(--text-dim)' }}>
                {s.size === 1 ? 'Narrow' : 'Wide'}
              </button>
              <Mini onClick={() => move(i, -1)} disabled={i === 0} label="Move left">‹</Mini>
              <Mini onClick={() => move(i, 1)} disabled={i === row.length - 1} label="Move right">›</Mini>
              <Mini onClick={() => set(row.filter((x) => x.id !== s.id))} label="Remove" data="remove">✕</Mini>
            </motion.li>
          ))}
        </ul>
      </div>
      <div>
        <span className="mb-1.5 block text-[11px]" style={faint}>Add a card{row.length >= DASH_ROW_MAX ? ' — the row is full; remove one first' : ''}</span>
        <div className="flex flex-wrap gap-1.5">
          {unused.map((c) => (
            <button key={c} type="button" disabled={row.length >= DASH_ROW_MAX} title={DASH_CARD_INFO[c].hint} data-dash-add={c}
              onClick={() => set([...row, { id: c, size: 1 }])}
              className="rounded-full border px-3 py-1 text-[12px] disabled:opacity-40"
              style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)', color: 'var(--text-dim)' }}>
              + {DASH_CARD_INFO[c].label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Mini({ children, onClick, disabled, label, data }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; label: string; data?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} data-dash-mini={data}
      className="grid size-6 place-items-center rounded-full text-[12px] hover:bg-[var(--glass-fill-strong)] disabled:opacity-25" style={{ color: 'var(--text-dim)' }}>
      {children}
    </button>
  );
}

/* ───────────────────────── the new cards ───────────────────────── */

/**
 * Process: twelve weeks of the four rings as a heatmap (Monday to Friday, one
 * column a week, the deeper the colour the more rings closed), then today
 * against its rings and the streak (lib/consistency). Nothing here is P&L.
 */
const HEAT_WEEKS = 12;
const RING_MARK: Record<string, string> = { done: '✓', open: '○', na: '–' };
function ProcessCard() {
  const [r, setR] = useState<{ today: DayRings; days: DayRings[]; streak: Streak } | null>(null);
  const live = useLiveTick();
  const today = localDay();
  const first = addDays(mondayOf(today), -(HEAT_WEEKS - 1) * 7);
  useEffect(() => { void getJson<typeof r>(`/api/consistency?today=${localDay()}&from=${first}`).then(setR); }, [live, first]);
  if (!r) return null;
  const by = new Map(r.days.map((x) => [x.day, x]));
  const weeks = Array.from({ length: HEAT_WEEKS }, (_, w) => addDays(first, w * 7));
  const level = (x: DayRings | undefined, day: string) => {
    if (day > today) return { bg: 'transparent', border: 'var(--glass-stroke)' };
    if (!x || !x.tradingDay) return { bg: 'var(--glass-fill)', border: 'transparent' };
    const f = x.of ? x.done / x.of : 0;
    const mix = x.closed ? 100 : f >= 0.66 ? 62 : f >= 0.33 ? 38 : f > 0 ? 20 : 0;
    return { bg: mix ? `color-mix(in srgb, rgb(var(--accent)) ${mix}%, transparent)` : 'var(--glass-stroke)', border: 'transparent' };
  };
  const month = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: 'short' });
  const t = r.today;
  return (
    <Card title="Process" note={`streak ${r.streak.current} · best ${r.streak.best}`} onTitle={() => navigate('/consistency')}>
      <div data-dash-process>
        <div className="grid gap-[3px]" style={{ gridTemplateColumns: `14px repeat(${HEAT_WEEKS}, minmax(0, 1fr))` }} data-dash-heatmap>
          <span />
          {weeks.map((w, i) => (
            <span key={w} className="overflow-visible whitespace-nowrap text-[9px] leading-3" style={faint}>{i === 0 || month(w) !== month(weeks[i - 1]) ? month(w) : ''}</span>
          ))}
          {WEEKDAY.map((wd, row) => (
            <Fragment key={row}>
              <span className="text-[9px] leading-none" style={{ ...faint, alignSelf: 'center' }}>{row % 2 === 0 ? wd : ''}</span>
              {weeks.map((w) => {
                const day = addDays(w, row);
                const x = by.get(day);
                const c = level(x, day);
                const what = day > today ? 'ahead' : !x ? 'no data' : !x.tradingDay ? (x.holiday ?? 'market closed')
                  : `${x.done} of ${x.of} rings · ${RINGS.map((g) => `${g.label} ${RING_MARK[x.rings[g.id]]}`).join('  ')}`;
                return (
                  <span key={day} title={`${new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} — ${what}`}
                    className="aspect-square max-h-[16px] w-full rounded-[3px]" data-heat-day={day}
                    style={{ background: c.bg, border: `1px solid ${c.border}`, outline: day === today ? '1.5px solid rgb(var(--accent))' : undefined, outlineOffset: 1 }} />
                );
              })}
            </Fragment>
          ))}
        </div>
        <div className="mt-1.5 flex items-center justify-end gap-1 text-[9px]" style={faint} aria-hidden>
          Fewer
          {[0, 20, 38, 62, 100].map((m) => <span key={m} className="size-[9px] rounded-[2px]" style={{ background: m ? `color-mix(in srgb, rgb(var(--accent)) ${m}%, transparent)` : 'var(--glass-stroke)' }} />)}
          All rings
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 border-t pt-2" style={{ borderColor: 'var(--glass-stroke)' }} data-dash-today-rings>
          <div className="shrink-0">
            <span className="text-[10px] uppercase tracking-[0.08em]" style={faint}>Today</span>
            <div className="text-[20px] font-semibold leading-none tabular-nums" style={{ color: t.closed ? 'rgb(var(--accent))' : 'var(--text)' }}>{t.done}<span className="text-[13px]" style={faint}>/{t.of}</span></div>
          </div>
          <div className="flex min-w-0 flex-wrap justify-end gap-1">
            {RINGS.map((g) => {
              const st = t.rings[g.id];
              return (
                <span key={g.id} title={g.hint} className="rounded-full border px-2 py-0.5 text-[10.5px]"
                  style={st === 'done'
                    ? { borderColor: 'rgb(var(--accent) / 0.5)', background: 'rgb(var(--accent) / 0.12)', color: 'rgb(var(--accent))' }
                    : { borderColor: 'var(--glass-stroke)', color: st === 'na' ? 'var(--text-faint)' : 'var(--text-dim)' }}>
                  {RING_MARK[st]} {g.label}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}

/** Study: minutes today against the goal, the streak, flashcards due. */
function StudyCard() {
  const { prefs } = usePreferences();
  const [s, setS] = useState<{ t: StudyTotals; due: number | null } | null>(null);
  const live = useLiveTick();
  useEffect(() => {
    const t = localDay();
    void Promise.all([
      getJson<{ totals: StudyTotals }>(`/api/study/sessions?today=${t}&goal=${prefs.studyMin}&max=${prefs.studyMax}`),
      getJson<{ stats: { due: number; fresh: number } }>(`/api/study/cards?today=${t}`),
    ]).then(([a, b]) => a && setS({ t: a.totals, due: b ? b.stats.due + b.stats.fresh : null }));
  }, [prefs.studyMin, prefs.studyMax, live]);
  if (!s) return null;
  return (
    <Card title="Study" note={s.t.streak ? `streak ${s.t.streak}` : undefined} onTitle={() => navigate('/study')}>
      <div data-dash-study><StudyMeter t={s.t} compact /></div>
      {s.due != null && <p className="mt-1.5 text-[11.5px]" style={{ color: 'var(--text-dim)' }}>{s.due ? `${s.due} flashcard${s.due === 1 ? '' : 's'} waiting` : 'No flashcards due'}</p>}
    </Card>
  );
}

/** Goals: each live goal with its streak and how today stands. */
function GoalsCard() {
  const [g, setG] = useState<Array<{ goal: { id: string; title: string; archived: boolean }; progress: { streak: number; unit: 'day' | 'week'; todayOk: boolean | null } }> | null>(null);
  const live = useLiveTick();
  useEffect(() => { void getJson<{ goals: NonNullable<typeof g> }>(`/api/goals?today=${localDay()}`).then((j) => setG(j?.goals ?? [])); }, [live]);
  if (!g) return null;
  const active = g.filter((x) => !x.goal.archived);
  return (
    <Card title="Goals" onTitle={openGoals}>
      {!active.length ? <Empty>No goals yet — press G to set one.</Empty> : (
        <ul className="space-y-1.5 text-[12px]" data-dash-goals>
          {active.slice(0, 5).map((x, i) => (
            <motion.li key={x.goal.id} initial={{ opacity: 0, x: 4 }} animate={{ opacity: 1, x: 0 }} transition={stagger(i)} className="flex items-center gap-2">
              <span className="text-[11px]" style={{ color: x.progress.todayOk == null ? 'var(--text-faint)' : x.progress.todayOk ? 'rgb(var(--outcome-win))' : 'rgb(var(--outcome-loss))' }}>
                {x.progress.todayOk == null ? '·' : x.progress.todayOk ? '✓' : '✗'}
              </span>
              <span className="min-w-0 flex-1 truncate">{x.goal.title}</span>
              <span className="tabular-nums" style={faint}>{x.progress.streak}{x.progress.unit === 'week' ? 'w' : 'd'}</span>
            </motion.li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Fix first: the leak from Stats. Information about a habit — never a setup to take. */
function FixCard() {
  const [p, setP] = useState<{ leak: { label: string; clear: boolean; costR: number; n: number; experiment: string | null } | null; trades: number } | null>(null);
  const live = useLiveTick();
  useEffect(() => { void getJson<NonNullable<typeof p>>('/api/study/plan').then(setP); }, [live]);
  if (!p) return null;
  return (
    <Card title="Fix first" note={p.leak ? (p.leak.clear ? 'from Stats' : 'not proven yet') : undefined} onTitle={() => navigate('/study')}>
      {!p.leak ? <Empty>{p.trades < 5 ? 'Shows up after a few settled trades.' : 'Nothing costs you clearly more than the rest.'}</Empty> : (
        <div data-dash-fix>
          <div className="text-[13.5px] font-semibold leading-snug">{p.leak.label}</div>
          <div className="mt-0.5 text-[11.5px]" style={{ color: 'var(--text-dim)' }}>
            about <span style={{ color: 'rgb(var(--outcome-loss))' }}>{Math.abs(p.leak.costR).toFixed(2)}R</span> each time · {p.leak.n} trades
          </div>
          {p.leak.experiment && <p className="mt-1.5 line-clamp-2 text-[11.5px]" style={faint}>{p.leak.experiment}</p>}
        </div>
      )}
    </Card>
  );
}

/** This month: every day, coloured by what it made or lost (from the curve the Dashboard already has). */
function MonthCard({ d, money }: { d: DashboardData; money: boolean }) {
  const today = localDay();
  const month = today.slice(0, 7);
  const net = new Map<string, number>();
  let prev = 0;
  for (const pt of d.curve) {
    const v = money ? pt.money ?? 0 : pt.r;
    if (pt.day.startsWith(month)) net.set(pt.day, (net.get(pt.day) ?? 0) + (v - prev));
    prev = v;
  }
  const first = `${month}-01`;
  const lead = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7;
  const len = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate();
  const max = Math.max(1e-9, ...[...net.values()].map(Math.abs));
  const total = [...net.values()].reduce((a, b) => a + b, 0);
  const fmt = (v: number) => (money ? `${v < 0 ? '−' : '+'}$${Math.abs(v).toFixed(0)}` : `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(1)}R`);
  return (
    <Card title="This month" note={net.size ? fmt(total) : undefined} onTitle={() => navigate('/calendar')}>
      <div className="grid grid-cols-7 gap-1" data-dash-month>
        {Array.from({ length: lead }, (_, i) => <span key={`x${i}`} />)}
        {Array.from({ length: len }, (_, i) => {
          const day = `${month}-${String(i + 1).padStart(2, '0')}`;
          const v = net.get(day);
          const a = v == null ? 0 : 0.18 + 0.62 * (Math.abs(v) / max);
          return (
            <span key={day} title={v == null ? day : `${day}: ${fmt(v)}`} className="grid aspect-square place-items-center rounded-[5px] text-[9px] tabular-nums"
              style={{ background: v == null ? 'var(--glass-fill)' : `rgb(var(${v >= 0 ? '--outcome-win' : '--outcome-loss'}) / ${a})`,
                color: day === today ? 'rgb(var(--accent))' : 'var(--text-faint)', fontWeight: day === today ? 700 : undefined }}>
              {i + 1}
            </span>
          );
        })}
      </div>
    </Card>
  );
}

/** Today's news: high and medium releases today, in the currencies you count. */
function NewsCard() {
  const [ev, setEv] = useState<Array<{ id: string | number; at: string; title: string; currency: string; impact: string; all_day?: boolean; forecast?: string | null; previous?: string | null }> | null>(null);
  const live = useLiveTick();
  useEffect(() => {
    const t = localDay();
    void getJson<{ events: NonNullable<typeof ev> }>(`/api/news?from=${t}&to=${t}`).then((j) => setEv((j?.events ?? []).filter((e) => e.impact === 'High' || e.impact === 'Medium')));
  }, [live]);
  if (!ev) return null;
  return (
    <Card title="Today's news" onTitle={() => navigate('/analytics?tab=news')}>
      {!ev.length ? <Empty>No high or medium releases today.</Empty> : (
        <ul className="space-y-1 text-[12px]" data-dash-news>
          {ev.slice(0, 6).map((e) => (
            <li key={String(e.id)} className="flex items-center gap-2">
              <span className="w-10 shrink-0 tabular-nums" style={faint}>{e.all_day ? 'All day' : e.at.slice(11, 16)}</span>
              <span className="size-1.5 shrink-0 rounded-full" style={{ background: e.impact === 'High' ? 'rgb(var(--outcome-loss))' : 'rgb(var(--amber))' }} />
              <span className="min-w-0 flex-1 truncate">{e.currency} {e.title}</span>
              {figuresLine(e, true) && <span className="shrink-0 tabular-nums text-[10.5px]" style={faint} title={figuresLine(e) ?? undefined} data-news-figures>{figuresLine(e, true)}</span>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
