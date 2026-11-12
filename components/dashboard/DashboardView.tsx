'use client';

import { InTitleBar, MergedHeader, useMergedHeader } from '@/components/shell/TitleSlot';
import { Reveal } from '@/components/ui/Motion';
import { useEffect, useState } from 'react';
import { QuoteOfDay } from '@/components/personal/QuoteOfDay';
import { Card } from './Card';
import { useLiveTick } from '@/lib/useLive';
import { DashRow, DashRowEditor } from './DashRow';
import { PropMini } from '@/components/prop/PropMini';
import { motion } from 'framer-motion';
import { usePreferences } from '@/components/shell/PreferencesProvider';
import { SETTINGS_TOGGLE } from '@/components/shell/Shortcuts';
import { press, spring, springSoft } from '@/lib/motion';
import { DIRECTIONS, SESSIONS } from '@/lib/domain';
import { openTrade } from '@/components/trade/openTrade';
import { DASH_PERIODS, type DashboardData, type DashWorld } from '@/lib/dashboard';
import { DailyCurve, NetPnl, Score, Tiles, rr, tone, usd } from './Panels';

/*
  The Dashboard (Phase 1). Every block, the world it counts, dollars or R,
  and the score's axes come from Settings → Dashboard.
*/

const WORLD_LABEL: Record<DashWorld, string> = { real: 'Real accounts', backtest: 'Backtests', all: 'Real and backtests' };

export interface AccountOption { key: string; label: string; n: number }

export function DashboardView({ data, today, accounts = [] }: { data: Record<DashWorld, DashboardData>; today: string; accounts?: AccountOption[] }) {
  const { prefs, update } = usePreferences();
  const chosen = prefs.dashAccounts.filter((k) => accounts.some((a) => a.key === k));
  const f = prefs.dashFilters;
  const filtered = chosen.length > 0 || f.period !== 'all' || f.sessions.length > 0 || f.dirs.length > 0;
  const nFilters = (chosen.length ? 1 : 0) + (f.period !== 'all' ? 1 : 0) + (f.sessions.length ? 1 : 0) + (f.dirs.length ? 1 : 0);
  const [open, setOpen] = useState(false);
  const [arranging, setArranging] = useState(false);
  const [picked, setPicked] = useState<DashboardData | null>(null);
  // Filtered views are worked out on the server (app/api/dashboard); the three unfiltered worlds come with the page.
  const query = `accounts=${encodeURIComponent(chosen.join(','))}&world=${prefs.dashWorld}&period=${f.period}&session=${encodeURIComponent(f.sessions.join(','))}&dir=${encodeURIComponent(f.dirs.join(','))}&today=${today}`;
  // A filtered view is fetched here, so it reloads on changes itself (the unfiltered ones come with the refreshed page).
  const live = useLiveTick({ focus: false });
  useEffect(() => {
    if (!filtered) { setPicked(null); return; }
    let alive = true;
    void fetch(`/api/dashboard?${query}`).then((r) => r.json()).then((j) => { if (alive) setPicked(j); }).catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, live]);
  const d = (filtered && picked) ? picked : data[prefs.dashWorld] ?? data.real;
  const setF = (patch: Partial<typeof f>) => update({ dashFilters: { ...f, ...patch } });
  const flip = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const money = prefs.dashUnit === 'money' && d.total.money != null;
  const merged = useMergedHeader();
  const b = prefs.dashBlocks;
  const toggle = (k: string) => update({ dashAccounts: chosen.includes(k) ? chosen.filter((x) => x !== k) : [...chosen, k] });
  const scope = [chosen.length ? chosen.map((k) => accounts.find((a) => a.key === k)?.label ?? k).join(', ') : WORLD_LABEL[prefs.dashWorld],
    f.period !== 'all' ? DASH_PERIODS.find(([k]) => k === f.period)?.[1] : null, f.sessions.length ? f.sessions.join(', ') : null, f.dirs.length ? f.dirs.join(', ') : null].filter(Boolean).join(' · ');
  return (
    <div className="mx-auto flex w-full max-w-[var(--page-wide)] flex-col px-6 pb-6 pt-4 xl:h-full" data-dashboard>
      <InTitleBar
        merged={<MergedHeader title="Dashboard" data="dashboard" sub={<>{new Date(`${today}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })} · {scope}</>}>
          <div className="flex items-center gap-1.5" data-dash-accounts>
          <Chip on={open || nFilters > 0} onClick={() => setOpen((o) => !o)} title="Accounts, period, session, direction" data="filters">
            Filters{nFilters ? ` · ${nFilters}` : ''} <span aria-hidden className="inline-block transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'none' }}>▾</span>
          </Chip>
          <Chip on={arranging} onClick={() => setArranging((a) => !a)} title="Choose and arrange the cards in the bottom row" data="cards">
            Cards <span aria-hidden className="inline-block transition-transform" style={{ transform: arranging ? 'rotate(180deg)' : 'none' }}>▾</span>
          </Chip>
          <Chip on={prefs.hidePnl} onClick={() => update({ hidePnl: !prefs.hidePnl })} title="Blur every money figure — hover one to peek" data="hide-pnl">
            {prefs.hidePnl ? 'Show P&L' : 'Hide P&L'}
          </Chip>
          <Chip onClick={() => window.dispatchEvent(new CustomEvent(SETTINGS_TOGGLE, { detail: { cat: 'dashboard' } }))} title="Settings → Dashboard: blocks, world, dollars or R, the score" data="customize">
            Customize
          </Chip>
</div>
        </MergedHeader>}
        inline={
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[20px] font-semibold leading-tight tracking-tight">Dashboard</h1>
          <p className="truncate text-[11.5px]" style={{ color: 'var(--text-faint)' }}>
            {new Date(`${today}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })} · {scope}
          </p>
          {/* Today's line, in the header — its own place, whatever the cards below show. */}
          {prefs.quoteOnDashboard && <QuoteOfDay inline className="mt-0.5 max-w-[44rem]" />}
        </div>
        <div className="flex flex-wrap items-center gap-1.5" data-dash-accounts>
          <Chip on={open || nFilters > 0} onClick={() => setOpen((o) => !o)} title="Accounts, period, session, direction" data="filters">
            Filters{nFilters ? ` · ${nFilters}` : ''} <span aria-hidden className="inline-block transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'none' }}>▾</span>
          </Chip>
          <Chip on={arranging} onClick={() => setArranging((a) => !a)} title="Choose and arrange the cards in the bottom row" data="cards">
            Cards <span aria-hidden className="inline-block transition-transform" style={{ transform: arranging ? 'rotate(180deg)' : 'none' }}>▾</span>
          </Chip>
          <Chip on={prefs.hidePnl} onClick={() => update({ hidePnl: !prefs.hidePnl })} title="Blur every money figure — hover one to peek" data="hide-pnl">
            {prefs.hidePnl ? 'Show P&L' : 'Hide P&L'}
          </Chip>
          <Chip onClick={() => window.dispatchEvent(new CustomEvent(SETTINGS_TOGGLE, { detail: { cat: 'dashboard' } }))} title="Settings → Dashboard: blocks, world, dollars or R, the score" data="customize">
            Customize
          </Chip>
        </div>
      </header>
        } />
      {/* In the title bar there is no room for the quote of the day: it heads the page instead. */}
      {merged && prefs.quoteOnDashboard && <QuoteOfDay inline className="mb-2 max-w-[44rem]" />}

      <Reveal open={arranging}>
        <div className="glass mb-3 rounded-[calc(18px*var(--rk))] px-4 py-3" data-dash-arrange>
          <DashRowEditor />
        </div>
      </Reveal>

      <Reveal open={open}>
        <div className="glass mb-3 grid gap-x-6 gap-y-2.5 rounded-[calc(18px*var(--rk))] px-4 py-3 sm:grid-cols-[auto_1fr]" data-dash-filters>
          <Row label="Accounts">
            {/* "All" used to mean the world picked in Settings (Real accounts by default), so a
                backtest vanished under it. Now it is every account; "Real" is the old default. */}
            <Pill on={!chosen.length && prefs.dashWorld === 'all'} onClick={() => update({ dashAccounts: [], dashWorld: 'all' })} title="Every account, real and backtest. Missed setups are picked on their own.">All</Pill>
            <Pill on={!chosen.length && prefs.dashWorld === 'real'} onClick={() => update({ dashAccounts: [], dashWorld: 'real' })} title="Live, Demo, Eval and Funded — no backtests">Real only</Pill>
            {accounts.filter((a) => !a.key.includes('|') || chosen.includes(a.key) || accounts.filter((x) => x.key.startsWith(`${a.key.split('|')[0]}|`)).length > 1).map((a) => (
              <Pill key={a.key} on={chosen.includes(a.key)} onClick={() => toggle(a.key)} title={a.key === 'Missed' ? `${a.n} missed setup${a.n === 1 ? '' : 's'}, counted by what they would have made` : `${a.n} trade${a.n === 1 ? '' : 's'}`}>{a.label}</Pill>
            ))}
          </Row>
          <Row label="Period">
            {DASH_PERIODS.map(([k, l]) => <Pill key={k} on={f.period === k} onClick={() => setF({ period: k })}>{l}</Pill>)}
          </Row>
          <Row label="Session">
            <Pill on={!f.sessions.length} onClick={() => setF({ sessions: [] })}>Any</Pill>
            {SESSIONS.map((x) => <Pill key={x} on={f.sessions.includes(x)} onClick={() => setF({ sessions: flip(f.sessions, x) })}>{x}</Pill>)}
          </Row>
          <Row label="Direction">
            <Pill on={!f.dirs.length} onClick={() => setF({ dirs: [] })}>Both</Pill>
            {DIRECTIONS.map((x) => <Pill key={x} on={f.dirs.includes(x)} onClick={() => setF({ dirs: flip(f.dirs, x) })}>{x}</Pill>)}
          </Row>
          {nFilters > 0 && (
            <div className="sm:col-span-2">
              <button type="button" className="text-[11px] underline-offset-2 hover:underline" style={{ color: 'var(--text-faint)' }}
                onClick={() => update({ dashAccounts: [], dashFilters: { period: 'all', sessions: [], dirs: [] } })}>Clear filters</button>
            </div>
          )}
        </div>
      </Reveal>

      {d.total.trades === 0 ? (
        <div className="glass rounded-[calc(24px*var(--rk))] p-10 text-center text-[13px]" style={{ color: 'var(--text-dim)' }}>
          No trades in {scope.toLowerCase()} yet.
        </div>
      ) : (
        // One screen: three rows, the middle one takes what is left.
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {(b.hero || b.tiles) && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {b.hero && <NetPnl d={d} money={money} />}
              {b.tiles && <Tiles d={d} money={money} />}
            </div>
          )}
          {(b.chart || b.week) && (
            <div className="grid min-h-[13rem] flex-1 gap-3 lg:grid-cols-[1.7fr_1fr]">
              {b.chart && <Card title="Daily net cumulative" note={money ? 'P&L at the close of each day traded' : 'R at the close of each day traded'} grow><DailyCurve d={d} money={money} /></Card>}
              {b.week && <Card title="This week" note="Net per day" grow><Week d={d} money={money} today={today} /></Card>}
            </div>
          )}
          <DashRow slots={prefs.dashRow} d={d} money={money} builtIn={{
            score: <Card title="Discipline score" note="Hover an axis for what it measures"><Score d={d} enabled={prefs.scoreAxes} /></Card>,
            recent: <Card title="Recent trades"><Recent d={d} money={money} openIn={prefs.openTradeIn} /></Card>,
            prop: <PropMini frame={(list) => <Card title="Prop accounts">{list}</Card>} empty={null} />,
          }} />
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <span className="pt-1 text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>{label}</span>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </>
  );
}

function Pill({ on, onClick, title, children }: { on: boolean; onClick: () => void; title?: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} title={title} className="rounded-full border px-2.5 py-1 text-[11.5px] font-medium"
      style={{ borderColor: on ? 'rgb(var(--accent) / 0.55)' : 'var(--glass-stroke)', background: on ? 'rgb(var(--accent) / 0.12)' : 'transparent', color: on ? 'rgb(var(--accent))' : 'var(--text-dim)' }}>
      {children}
    </button>
  );
}

function Chip({ on = false, onClick, title, children, data }: { on?: boolean; onClick: () => void; title: string; children: React.ReactNode; data: string }) {
  return (
    <motion.button type="button" onClick={onClick} title={title} whileTap={press} transition={spring} data-dash-action={data}
      className="rounded-full border px-3.5 py-1.5 text-[12px] font-medium"
      style={{ borderColor: on ? 'rgb(var(--accent) / 0.55)' : 'var(--glass-stroke)', background: on ? 'rgb(var(--accent) / 0.12)' : 'var(--glass-fill)', color: on ? 'rgb(var(--accent))' : 'var(--text-dim)' }}>
      {children}
    </motion.button>
  );
}


function Week({ d, money, today }: { d: DashboardData; money: boolean; today: string }) {
  const vals = d.week.map((w) => (money ? w.money ?? 0 : w.r));
  const max = Math.max(1e-9, ...vals.map(Math.abs));
  const net = vals.reduce((s, v) => s + v, 0);
  return (
    <div className="flex h-full min-h-[9rem] flex-col" data-dash-week>
      {d.week.some((w) => w.trades)
        ? <div className="mb-1 text-[18px] font-semibold tabular-nums" style={{ color: tone(net) }} data-money={money ? '' : undefined}>{money ? usd(net) : rr(net, 1)}</div>
        : <div className="mb-1 text-[12.5px]" style={{ color: 'var(--text-faint)' }}>No trades yet this week.</div>}
      <div className="flex min-h-0 flex-1 items-end gap-2">
        {d.week.map((w, i) => {
          const v = vals[i];
          return (
            <div key={w.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${w.day}: ${w.trades} trade${w.trades === 1 ? '' : 's'}, ${money ? usd(v) : rr(v, 1)}`}>
              <motion.div initial={{ height: 0 }} animate={{ height: `${Math.max(w.trades ? 6 : 2, (Math.abs(v) / max) * 85)}%` }} transition={springSoft}
                className="w-full rounded-[6px]"
                style={{ background: !w.trades ? 'var(--glass-stroke)' : v >= 0 ? 'rgb(var(--outcome-win) / 0.75)' : 'rgb(var(--outcome-loss) / 0.75)',
                  outline: w.day === today ? '1.5px solid rgb(var(--accent) / 0.6)' : undefined, outlineOffset: 2 }} />
              <span className="text-[10px]" style={{ color: w.day === today ? 'rgb(var(--accent))' : 'var(--text-faint)' }}>
                {new Date(`${w.day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' })}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Recent({ d, money, openIn }: { d: DashboardData; money: boolean; openIn: 'page' | 'board' }) {
  return (
    <ul className="divide-y" style={{ borderColor: 'var(--glass-stroke)' }} data-dash-recent>
      {d.recent.slice(0, 5).map((t) => (
        <li key={t.id}>
          <button type="button" className="flex w-full items-center justify-between gap-3 py-1.5 text-left text-[12px] hover:opacity-80"
            onClick={() => openTrade(t.id, openIn)}
            title="Open on the board">
            <span className="min-w-0 truncate">
              <b className="font-medium">{t.setup} {t.direction}</b>
              <span style={{ color: 'var(--text-faint)' }}> · {new Date(`${t.day}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · {t.account.replace(' (FX Replay)', '')}</span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums" style={{ color: tone(t.r) }} data-money={money && t.money != null ? '' : undefined}>
              {money && t.money != null ? usd(t.money) : rr(t.r)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
