'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { usePreferences } from '@/components/shell/PreferencesProvider';
import { QuoteOfDay } from '@/components/personal/QuoteOfDay';
import { Rings } from '@/components/consistency/Rings';
import { openGoals } from '@/components/goals/GoalsSheet';
import { navigate } from '@/lib/nav';
import { localDay } from '@/lib/day';
import { springSoft, stagger } from '@/lib/motion';
import { mondayOf, type DayRings, type Streak } from '@/lib/consistency';
import { DASH_CARDS, DASH_CARD_INFO, DASH_ROW_MAX, type DashCard, type DashSlot } from '@/lib/preferences';
import type { DashboardData } from '@/lib/dashboard';
import { Card } from './Card';
import { useLiveTick } from '@/lib/useLive';

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

/** Process this week: the rings for each trading day and the streak (lib/consistency). */
function ProcessCard() {
  const [r, setR] = useState<{ days: DayRings[]; closedDays: number; tradingDays: number; streak: Streak } | null>(null);
  const live = useLiveTick();
  useEffect(() => { const t = localDay(); void getJson<typeof r>(`/api/consistency?today=${t}&week=${mondayOf(t)}`).then(setR); }, [live]);
  if (!r) return null;
  const monday = mondayOf(localDay());
  const days = Array.from({ length: 5 }, (_, i) => { const d = new Date(`${monday}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(0, 10); });
  const by = new Map(r.days.map((x) => [x.day, x]));
  return (
    <Card title="Process this week" note={`streak ${r.streak.current}`} onTitle={() => navigate('/consistency')}>
      <div className="flex items-end justify-between gap-1" data-dash-process>
        {days.map((day, i) => {
          const x = by.get(day);
          return (
            <div key={day} className="flex flex-col items-center gap-1">
              {x ? <Rings day={x} size={34} stroke={3.4} /> : <div className="size-[34px]" />}
              <span className="text-[10px]" style={faint}>{WEEKDAY[i]}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-1.5 text-[11.5px]" style={{ color: 'var(--text-dim)' }}>{r.closedDays} of {r.tradingDays} days with every ring closed · best streak {r.streak.best}</p>
    </Card>
  );
}

/** Study: minutes today against the goal, the streak, flashcards due. */
function StudyCard() {
  const { prefs } = usePreferences();
  const [s, setS] = useState<{ today: number; goal: number; streak: number; due: number | null } | null>(null);
  const live = useLiveTick();
  useEffect(() => {
    const t = localDay();
    void Promise.all([
      getJson<{ totals: { today: number; goal: number; streak: number } }>(`/api/study/sessions?today=${t}&goal=${prefs.studyGoal}`),
      getJson<{ stats: { due: number; fresh: number } }>(`/api/study/cards?today=${t}`),
    ]).then(([a, b]) => a && setS({ ...a.totals, due: b ? b.stats.due + b.stats.fresh : null }));
  }, [prefs.studyGoal, live]);
  if (!s) return null;
  const share = Math.min(1, s.today / Math.max(1, s.goal));
  return (
    <Card title="Study" note={s.streak ? `${s.streak} day${s.streak === 1 ? '' : 's'} in a row` : undefined} onTitle={() => navigate('/study')}>
      <div className="flex items-baseline gap-2" data-dash-study>
        <span className="text-[24px] font-semibold tabular-nums tracking-tight">{s.today}</span>
        <span className="text-[12px]" style={{ color: 'var(--text-dim)' }}>of {s.goal} min today</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--glass-fill-strong)' }}>
        <motion.div className="h-full rounded-full" style={{ background: 'rgb(var(--accent))' }} initial={{ width: 0 }} animate={{ width: `${share * 100}%` }} transition={springSoft} />
      </div>
      {s.due != null && <p className="mt-2 text-[11.5px]" style={{ color: 'var(--text-dim)' }}>{s.due ? `${s.due} flashcard${s.due === 1 ? '' : 's'} waiting` : 'No flashcards due'}</p>}
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
  const [ev, setEv] = useState<Array<{ id: string | number; at: string; title: string; currency: string; impact: string; all_day?: boolean }> | null>(null);
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
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
