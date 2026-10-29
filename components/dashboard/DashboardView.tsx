'use client';

import { useState } from 'react';
import { PropMini } from '@/components/prop/PropMini';
import { motion } from 'framer-motion';
import { usePreferences } from '@/components/shell/PreferencesProvider';
import { SETTINGS_TOGGLE } from '@/components/shell/Shortcuts';
import { press, spring, springSoft } from '@/lib/motion';
import { openTrade } from '@/components/trade/openTrade';
import { overallScore, SCORE_AXES, type DashboardData, type DashWorld, type TileValues } from '@/lib/dashboard';

/*
  The Dashboard (Phase 1). Every block, the world it counts, dollars or R,
  and the score's axes come from Settings → Dashboard.
*/

const usd = (v: number | null, sign = true) => (v == null ? '—'
  : `${sign ? (v < 0 ? '−' : v > 0 ? '+' : '') : (v < 0 ? '−' : '')}$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const rr = (v: number | null, dp = 2) => (v == null ? '—' : `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(dp)}R`);
const pct = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);
const tone = (v: number | null) => (v == null ? 'var(--text-faint)' : v > 0 ? 'rgb(var(--outcome-win))' : v < 0 ? 'rgb(var(--outcome-loss))' : 'var(--text)');
const WORLD_LABEL: Record<DashWorld, string> = { real: 'Real accounts', backtest: 'Backtests', all: 'Real and backtests' };

export function DashboardView({ data, today }: { data: Record<DashWorld, DashboardData>; today: string }) {
  const { prefs, update } = usePreferences();
  const d = data[prefs.dashWorld] ?? data.real;
  const money = prefs.dashUnit === 'money' && d.total.money != null;
  const b = prefs.dashBlocks;
  return (
    <div className="mx-auto w-full max-w-[76rem] px-6 pb-20 pt-4" data-dashboard>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Dashboard</h1>
          <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>
            {new Date(`${today}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · {WORLD_LABEL[d.world]}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Chip on={prefs.hidePnl} onClick={() => update({ hidePnl: !prefs.hidePnl })} title="Blur every money figure — hover one to peek" data="hide-pnl">
            {prefs.hidePnl ? 'Show P&L' : 'Hide P&L'}
          </Chip>
          <Chip onClick={() => window.dispatchEvent(new Event(SETTINGS_TOGGLE))} title="Settings → Dashboard: blocks, world, dollars or R, the score" data="customize">
            Customize
          </Chip>
        </div>
      </header>

      {d.total.trades === 0 ? (
        <div className="glass rounded-[calc(24px*var(--rk))] p-10 text-center text-[13px]" style={{ color: 'var(--text-dim)' }}>
          No trades in {WORLD_LABEL[d.world].toLowerCase()} yet. Change what the Dashboard counts in Customize.
        </div>
      ) : (
        <div className="space-y-4">
          {b.hero && <Hero d={d} money={money} />}
          {b.tiles && <Tiles d={d} money={money} />}
          <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
            {b.chart && <Card title="Cumulative" note={money ? 'Net P&L, in the order traded' : 'Net R, in the order traded'}><Curve d={d} money={money} /></Card>}
            {b.week && <Card title="This week" note="Net per day, Monday to Sunday"><Week d={d} money={money} today={today} /></Card>}
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
            {b.score && <Card title="Discipline score" note="How you trade, not what you made. Hover an axis for what it measures; choose the axes in Customize."><Score d={d} enabled={prefs.scoreAxes} /></Card>}
            {b.recent && <Card title="Recent trades"><Recent d={d} money={money} openIn={prefs.openTradeIn} /></Card>}
            {b.prop && <PropMini frame={(list) => <Card title="Prop accounts">{list}</Card>} />}
          </div>
        </div>
      )}
    </div>
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

function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={springSoft}
      className="glass rounded-[calc(22px*var(--rk))] p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>{title}</h2>
        {note && <span className="text-[10.5px]" style={{ color: 'var(--text-faint)' }}>{note}</span>}
      </div>
      <div className="mt-3">{children}</div>
    </motion.section>
  );
}

function Hero({ d, money }: { d: DashboardData; money: boolean }) {
  const main = money ? d.total.money : d.total.r;
  const week = money ? d.week7.money : d.week7.r;
  return (
    <section data-dash-hero className="py-6 text-center">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-faint)' }}>Total {money ? 'P&L' : 'R'}</div>
      <div className="mt-1 text-[56px] font-semibold leading-none tracking-tight tabular-nums sm:text-[72px]" style={{ color: tone(main) }} data-money={money ? '' : undefined}>
        {money ? usd(main) : rr(main, 1)}
      </div>
      <div className="mt-3 text-[12.5px] tabular-nums" style={{ color: 'var(--text-dim)' }}>
        {d.week7.trades === 0 ? 'Nothing in the last 7 days'
          : <><span style={{ color: tone(week) }} data-money={money ? '' : undefined}>{money ? usd(week ?? 0) : rr(week, 1)}</span> in the last 7 days</>}{' '}
        · {d.total.wins}W / {d.total.losses}L · {d.total.trades} trades
      </div>
    </section>
  );
}

function delta(now: number | null, before: number | null, kind: 'pct' | 'r' | 'usd' | 'x') {
  if (now == null || before == null) return null;
  const v = now - before;
  if (Math.abs(v) < 1e-9) return null;
  const s = kind === 'pct' ? `${(Math.abs(v) * 100).toFixed(1)}%` : kind === 'usd' ? `$${Math.abs(v).toFixed(0)}` : kind === 'x' ? Math.abs(v).toFixed(2) : `${Math.abs(v).toFixed(2)}R`;
  return { up: v > 0, text: s };
}

function Tiles({ d, money }: { d: DashboardData; money: boolean }) {
  const a: TileValues = d.tiles.all; const n = d.tiles.last30; const p = d.tiles.prev30;
  const tiles = [
    { label: 'Win rate', value: pct(a.winRate), sub: `${d.total.wins + d.total.losses} decided trades`, delta: delta(n.winRate, p.winRate, 'pct'), money: false },
    { label: 'Avg win', value: rr(a.avgWinR), sub: `Profit factor ${a.profitFactor?.toFixed(2) ?? '—'}`, delta: delta(n.avgWinR, p.avgWinR, 'r'), money: false },
    money
      ? { label: 'Avg win / loss', value: usd(a.avgWin, false), sub: `Avg loss ${usd(a.avgLoss, false)}`, delta: delta(n.avgWin, p.avgWin, 'usd'), money: true }
      : { label: 'Profit factor', value: a.profitFactor?.toFixed(2) ?? '—', sub: 'R won over R lost', delta: delta(n.profitFactor, p.profitFactor, 'x'), money: false },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-3" data-dash-tiles>
      {tiles.map((t) => (
        <motion.div key={t.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={springSoft}
          className="glass rounded-[calc(18px*var(--rk))] px-4 py-3.5">
          <div className="flex items-start justify-between gap-2">
            <span className="text-[10px] uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>{t.label}</span>
            {t.delta && (
              <span className="text-[10.5px] font-medium tabular-nums" title="Last 30 days against the 30 before"
                style={{ color: t.delta.up ? 'rgb(var(--outcome-win))' : 'rgb(var(--outcome-loss))' }}>
                {t.delta.up ? '↗' : '↘'} {t.delta.text} <span style={{ color: 'var(--text-faint)' }}>30d</span>
              </span>
            )}
          </div>
          <div className="mt-1.5 text-[24px] font-semibold leading-none tabular-nums" data-money={t.money ? '' : undefined}>{t.value}</div>
          <div className="mt-1.5 text-[11px]" style={{ color: 'var(--text-faint)' }} data-money={t.money ? '' : undefined}>{t.sub}</div>
        </motion.div>
      ))}
    </div>
  );
}

function Curve({ d, money }: { d: DashboardData; money: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const pts = d.curve.map((p) => (money ? p.money ?? 0 : p.r));
  if (pts.length < 2) return <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>A couple more trades and the line appears.</p>;
  const W = 640; const H = 200; const pad = 8;
  const lo = Math.min(0, ...pts); const hi = Math.max(0, ...pts); const span = hi - lo || 1;
  const x = (i: number) => pad + (i / (pts.length - 1)) * (W - pad * 2);
  const y = (v: number) => pad + (1 - (v - lo) / span) * (H - pad * 2);
  const line = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  const hue = last >= 0 ? '--outcome-win' : '--outcome-loss';
  const shown = hover ?? pts.length - 1;
  return (
    <div data-dash-curve>
      <div className="mb-1 flex items-baseline justify-between text-[11.5px] tabular-nums">
        <span style={{ color: 'var(--text-faint)' }}>{d.curve[shown].day}</span>
        <b style={{ color: tone(pts[shown]) }} data-money={money ? '' : undefined}>{money ? usd(pts[shown]) : rr(pts[shown], 1)}</b>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[200px] w-full" preserveAspectRatio="none"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => { const r = (e.currentTarget as SVGElement).getBoundingClientRect(); setHover(Math.max(0, Math.min(pts.length - 1, Math.round(((e.clientX - r.left) / r.width) * (pts.length - 1))))); }}>
        <defs>
          <linearGradient id="dash-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={`rgb(var(${hue}))`} stopOpacity="0.22" />
            <stop offset="1" stopColor={`rgb(var(${hue}))`} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={pad} x2={W - pad} y1={y(0)} y2={y(0)} stroke="var(--glass-stroke)" strokeDasharray="4 4" />
        <path d={`${line} L${x(pts.length - 1)},${y(lo)} L${x(0)},${y(lo)} Z`} fill="url(#dash-fill)" />
        <path d={line} fill="none" stroke={`rgb(var(${hue}))`} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        <circle cx={x(shown)} cy={y(pts[shown])} r="4" fill={`rgb(var(${hue}))`} stroke="var(--bg-raised)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

function Week({ d, money, today }: { d: DashboardData; money: boolean; today: string }) {
  const vals = d.week.map((w) => (money ? w.money ?? 0 : w.r));
  const max = Math.max(1e-9, ...vals.map(Math.abs));
  const net = vals.reduce((s, v) => s + v, 0);
  return (
    <div data-dash-week>
      {d.week.some((w) => w.trades)
        ? <div className="mb-2 text-[22px] font-semibold tabular-nums" style={{ color: tone(net) }} data-money={money ? '' : undefined}>{money ? usd(net) : rr(net, 1)}</div>
        : <div className="mb-2 text-[13px]" style={{ color: 'var(--text-faint)' }}>No trades yet this week.</div>}
      <div className="flex h-[150px] items-end gap-2">
        {d.week.map((w, i) => {
          const v = vals[i];
          return (
            <div key={w.day} className="flex flex-1 flex-col items-center gap-1" title={`${w.day}: ${w.trades} trade${w.trades === 1 ? '' : 's'}, ${money ? usd(v) : rr(v, 1)}`}>
              <motion.div initial={{ height: 0 }} animate={{ height: `${Math.max(w.trades ? 6 : 2, (Math.abs(v) / max) * 120)}px` }} transition={springSoft}
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

function Score({ d, enabled }: { d: DashboardData; enabled: Record<string, boolean> }) {
  const axes = SCORE_AXES.filter((a) => enabled[a.key] !== false);
  const score = overallScore(d.axes, enabled);
  const R = 78; const C = 100;
  const at = (i: number, r: number) => {
    const ang = -Math.PI / 2 + (i / axes.length) * Math.PI * 2;
    return [C + Math.cos(ang) * r, C + Math.sin(ang) * r] as const;
  };
  const shape = axes.map((a, i) => at(i, ((d.axes[a.key] ?? 0) / 100) * R).join(',')).join(' ');
  return (
    <div className="flex flex-wrap items-center gap-5" data-dash-score={score ?? ''}>
      <div className="text-center">
        <div className="text-[48px] font-semibold leading-none tabular-nums"
          style={{ color: score == null ? 'var(--text-faint)' : score >= 70 ? 'rgb(var(--outcome-win))' : score >= 45 ? 'rgb(var(--accent))' : 'rgb(var(--outcome-loss))' }}>
          {score ?? '—'}
        </div>
        <div className="mt-1 text-[10.5px]" style={{ color: 'var(--text-faint)' }}>out of 100</div>
      </div>
      {axes.length >= 3 && (
        <svg viewBox="0 0 200 200" className="h-[190px] w-[190px]">
          {[0.33, 0.66, 1].map((k) => (
            <polygon key={k} points={axes.map((_, i) => at(i, R * k).join(',')).join(' ')} fill="none" stroke="var(--glass-stroke)" />
          ))}
          <motion.polygon initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={springSoft}
            points={shape} fill="rgb(var(--accent) / 0.18)" stroke="rgb(var(--accent))" strokeWidth="1.5" />
          {axes.map((a, i) => {
            const [lx, ly] = at(i, R + 14);
            return (
              <text key={a.key} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fontSize="8.5" fill="var(--text-dim)">
                <title>{`${a.hint} ${d.axes[a.key] ?? '—'}/100`}</title>{a.label}
              </text>
            );
          })}
        </svg>
      )}
      <ul className="min-w-[9rem] flex-1 space-y-1 text-[11.5px] tabular-nums">
        {axes.map((a) => (
          <li key={a.key} className="flex justify-between gap-3" title={a.hint}>
            <span style={{ color: 'var(--text-dim)' }}>{a.label}</span><b>{d.axes[a.key] ?? '—'}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Recent({ d, money, openIn }: { d: DashboardData; money: boolean; openIn: 'page' | 'board' }) {
  return (
    <ul className="divide-y" style={{ borderColor: 'var(--glass-stroke)' }} data-dash-recent>
      {d.recent.map((t) => (
        <li key={t.id}>
          <button type="button" className="flex w-full items-center justify-between gap-3 py-2 text-left text-[12px] hover:opacity-80"
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
