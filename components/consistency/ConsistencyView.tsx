'use client';

import { SwapIn } from '@/components/ui/Motion';
import { useCallback, useEffect, useState } from 'react';
import { useLive, useLiveTick } from '@/lib/useLive';
import { motion } from 'framer-motion';
import { TogglePill } from '@/components/ui/TogglePill';
import { localDay } from '@/lib/day';
import { springSoft, stagger } from '@/lib/motion';
import { RINGS, addDays, mondayOf, type DayRings, type RingId, type Streak, type WeekReport } from '@/lib/consistency';
import { marketHoliday } from '@/lib/marketHolidays';
import { RING_COLOR, Rings } from './Rings';

type Report = WeekReport & { streak: Streak };
const WEEKDAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** What to do about the ring left open most — practical, never about P&L. */
const ADVICE: Record<RingId, string> = {
  prep: 'Start the morning check-in before the open — the prep reminder fires 30 minutes ahead.',
  rules: 'One rule at a time: make the most broken one this week’s focus rule.',
  journal: 'Finish each trade the same day: settle it, write the lesson, turn quick logs into full ones.',
  review: 'Journal once a day — a page or the day review, even two lines on a day you sat out. The evening reminder asks.',
};

/**
 * Consistency: the week in process (the Sunday report), the fair streak, and
 * the month as rings. Process only — no P&L on this page, on purpose.
 */
export function ConsistencyView({ initialWeek }: { initialWeek: string | null }) {
  const today = localDay();
  const [monday, setMonday] = useState(() => mondayOf(initialWeek ?? today));
  const [report, setReport] = useState<Report | null>(null);
  const [restDay, setRestDay] = useState<boolean | null>(null);

  const load = useCallback(() => {
    fetch(`/api/consistency?today=${today}&week=${monday}`).then((r) => r.json()).then(setReport).catch(() => {});
  }, [today, monday]);
  useEffect(() => { load(); }, [load]);
  useLive(load, { ignore: ['/api/consistency'] });
  useEffect(() => { fetch(`/api/consistency?today=${today}&from=${today}`).then((r) => r.json()).then((d) => setRestDay(Boolean(d.restDay))).catch(() => {}); }, [today]);

  const toggleRest = async (on: boolean) => {
    setRestDay(on);
    await fetch('/api/consistency', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ restDay: on }) });
    load();
  };

  const thisWeek = mondayOf(today);
  const week = Array.from({ length: 5 }, (_, i) => addDays(monday, i));
  const byDay = new Map((report?.days ?? []).map((d) => [d.day, d]));

  return (
    <div data-consistency>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight">Consistency</h1>
          <p className="mt-1 max-w-[42rem] text-[13px]" style={{ color: 'var(--text-dim)' }}>
            Did you do the process — prep, rules, journal, review — each trading day. Not P&amp;L: a red day with every ring closed is a good day here.
            Weekends and market holidays never break a streak.
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[12px]">
          <NavButton onClick={() => setMonday(addDays(monday, -7))} label="Previous week">‹</NavButton>
          <span className="min-w-[9.5rem] text-center font-medium tabular-nums" data-consistency-week={monday}>
            {monday === thisWeek ? 'This week' : `${fmt(monday)} – ${fmt(addDays(monday, 4))}`}
          </span>
          <NavButton onClick={() => setMonday(addDays(monday, 7))} label="Next week" disabled={monday >= thisWeek}>›</NavButton>
        </div>
      </div>

      <SwapIn k={monday}><div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <Head title="The week" right={report ? `${report.closedDays} of ${report.tradingDays} days closed` : ''} />
          <div className="grid grid-cols-5 gap-2">
            {week.map((d, i) => {
              const r = byDay.get(d);
              const future = d > today;
              return (
                <motion.div key={d} data-consistency-day={d} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={stagger(i)}
                  className="flex flex-col items-center gap-1.5 rounded-[calc(14px*var(--rk))] py-3"
                  style={{ background: r?.closed ? 'var(--glass-fill-strong)' : 'transparent' }}>
                  <span className="text-[11px] font-medium" style={{ color: 'var(--text-dim)' }}>{WEEKDAY[i]}</span>
                  {r ? <Rings day={r} size={58} /> : <div className="grid size-[58px] place-items-center text-[10.5px]" style={{ color: 'var(--text-faint)' }}>{future ? '' : 'Market closed'}</div>}
                  <span className="text-[10.5px] tabular-nums" style={{ color: 'var(--text-faint)' }}>
                    {r ? `${r.done}/${r.of}` : future ? fmt(d) : marketNote(d)}
                  </span>
                  <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-faint)' }} data-day-trades={r?.trades ?? 0}>
                    {r && r.trades ? `${r.trades} trade${r.trades === 1 ? '' : 's'}${r.backtests ? ` · ${r.backtests === r.trades ? 'all' : r.backtests} BT` : ''}` : r ? 'no trades' : ''}
                  </span>
                </motion.div>
              );
            })}
          </div>
          <div className="mt-4 space-y-2">
            {RINGS.map((ring) => {
              const now = report?.ringRates[ring.id]; const before = report?.lastWeek[ring.id];
              const pct = now && now.of ? now.done / now.of : null;
              return (
                <div key={ring.id} className="flex items-center gap-3 text-[12px]" title={ring.hint} data-consistency-ring={ring.id}>
                  <span className="w-16 shrink-0" style={{ color: 'var(--text-dim)' }}>{ring.label}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--glass-fill-strong)' }}>
                    <motion.div className="h-full rounded-full" style={{ background: RING_COLOR[ring.id] }}
                      initial={{ width: 0 }} animate={{ width: `${Math.round((pct ?? 0) * 100)}%` }} transition={springSoft} />
                  </div>
                  <span className="w-12 shrink-0 text-right tabular-nums">{now?.of ? `${now.done}/${now.of}` : '—'}</span>
                  <span className="w-24 shrink-0 text-right text-[11px] tabular-nums" style={{ color: 'var(--text-faint)' }}>
                    {before?.of ? `last week ${before.done}/${before.of}` : ''}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <Head title="Streak" />
            <div className="flex items-baseline gap-2">
              <span className="text-[34px] font-semibold tabular-nums tracking-tight" data-consistency-streak>{report?.streak.current ?? '—'}</span>
              <span className="text-[13px]" style={{ color: 'var(--text-dim)' }}>trading days in a row, every ring closed</span>
            </div>
            <p className="mt-1 text-[12px]" style={{ color: 'var(--text-faint)' }}>
              Best: {report?.streak.best ?? 0}{report?.streak.rested.length ? ` · rest day used ${report.streak.rested.map(fmt).join(', ')}` : ''}
            </p>
            {restDay !== null && (
              <div className="mt-3">
                <TogglePill checked={restDay} onChange={toggleRest} label="One rest day a week"
                  hint="One open trading day a week neither adds to nor breaks the streak. Also applies to the study streak." />
              </div>
            )}
          </Card>
          <Card>
            <Head title="The one to work on" />
            {report?.weakest ? (
              <div data-consistency-weakest={report.weakest}>
                <div className="flex items-center gap-2 text-[14px] font-semibold">
                  <span className="size-2.5 rounded-full" style={{ background: RING_COLOR[report.weakest] }} />
                  {RINGS.find((r) => r.id === report.weakest)!.label}
                  <span className="text-[12px] font-normal" style={{ color: 'var(--text-faint)' }}>
                    open {report.ringRates[report.weakest].of - report.ringRates[report.weakest].done} of {report.ringRates[report.weakest].of} days
                  </span>
                </div>
                <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: 'var(--text-dim)' }}>{ADVICE[report.weakest]}</p>
              </div>
            ) : (
              <p className="text-[12.5px]" style={{ color: 'var(--text-dim)' }}>{report?.tradingDays ? 'Every ring closed every day. Same again next week.' : 'Nothing recorded this week yet.'}</p>
            )}
            {report && report.tradesTaken > 0 && (
              <p className="mt-3 text-[11.5px]" style={{ color: 'var(--text-faint)' }}>
                {report.tradesTaken} trade{report.tradesTaken === 1 ? '' : 's'} taken · {report.tradesBroke ? `${report.tradesBroke} broke a rule` : 'none broke a rule'}
              </p>
            )}
          </Card>
        </div>
      </div></SwapIn>

      <ProcessMonth today={today} />
    </div>
  );
}

/** A weekday with no rings is a market holiday. */
const marketNote = (d: string) => marketHoliday(d) ?? '';

/** The month as rings — the process calendar. */
function ProcessMonth({ today }: { today: string }) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [days, setDays] = useState<DayRings[] | null>(null);
  const live = useLiveTick({ ignore: ['/api/consistency'] });
  useEffect(() => {
    const first = `${month}-01`;
    const last = addDays(`${addDays(first, 32).slice(0, 7)}-01`, -1);
    const end = last < today ? last : today;
    fetch(`/api/consistency?today=${end}&from=${first}`).then((r) => r.json()).then((d) => setDays(d.days)).catch(() => {});
  }, [month, today, live]);
  const first = `${month}-01`;
  const lead = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7;
  const len = Number(addDays(`${addDays(first, 32).slice(0, 7)}-01`, -1).slice(8));
  const byDay = new Map((days ?? []).map((d) => [d.day, d]));
  const shift = (n: number) => { const d = new Date(`${first}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); setMonth(d.toISOString().slice(0, 7)); };
  const closed = (days ?? []).filter((d) => d.tradingDay && d.closed && d.of > 0).length;
  const trading = (days ?? []).filter((d) => d.tradingDay).length;

  return (
    <Card className="mt-4" data-process-month={month}>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>Process calendar</span>
        <div className="flex items-center gap-1.5 text-[12px]">
          <span className="mr-2 text-[11px] tabular-nums" style={{ color: 'var(--text-faint)' }}>{days ? `${closed} of ${trading} trading days closed` : ''}</span>
          <NavButton onClick={() => shift(-1)} label="Previous month">‹</NavButton>
          <span className="min-w-[7.5rem] text-center font-medium">{MONTHS[Number(month.slice(5)) - 1]} {month.slice(0, 4)}</span>
          <NavButton onClick={() => shift(1)} label="Next month" disabled={month >= today.slice(0, 7)}>›</NavButton>
        </div>
      </div>
      <SwapIn k={month}><div className="grid grid-cols-7 gap-1.5 text-center text-[10.5px]" style={{ color: 'var(--text-faint)' }}>
        {WEEKDAY.map((w) => <span key={w}>{w}</span>)}
        {Array.from({ length: lead }, (_, i) => <span key={`x${i}`} />)}
        {Array.from({ length: len }, (_, i) => {
          const d = `${month}-${String(i + 1).padStart(2, '0')}`;
          const r = byDay.get(d);
          const weekend = (lead + i) % 7 >= 5;
          return (
            <div key={d} data-process-day={d} className="flex flex-col items-center gap-0.5 rounded-[calc(10px*var(--rk))] py-1.5"
              title={r?.holiday ?? undefined}
              style={{ background: r?.closed && r.tradingDay ? 'var(--glass-fill-strong)' : 'transparent', opacity: weekend || r?.holiday ? 0.45 : 1 }}>
              <span className="tabular-nums" style={{ color: d === today ? 'rgb(var(--accent))' : undefined, fontWeight: d === today ? 600 : undefined }}>{i + 1}</span>
              {r && r.tradingDay && d <= today ? <Rings day={r} size={30} stroke={3} /> : <span className="size-[30px]">{r?.holiday ? '·' : ''}</span>}
            </div>
          );
        })}
      </div></SwapIn>
    </Card>
  );
}

function Card({ children, className = '', ...rest }: { children: React.ReactNode; className?: string } & Record<`data-${string}`, string>) {
  return <section {...rest} className={`glass rounded-[calc(20px*var(--rk))] p-5 ${className}`}>{children}</section>;
}
function Head({ title, right }: { title: string; right?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>{title}</span>
      {right && <span className="text-[11.5px] tabular-nums" style={{ color: 'var(--text-dim)' }}>{right}</span>}
    </div>
  );
}
function NavButton({ children, onClick, label, disabled }: { children: React.ReactNode; onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} disabled={disabled}
      className="grid size-7 place-items-center rounded-full border text-[14px] disabled:opacity-30"
      style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }}>{children}</button>
  );
}
